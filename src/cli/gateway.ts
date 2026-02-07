import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { loadConfig } from '../core/config.js';
import { PROTOCOL_VERSION, type GatewayFrame, type GatewayResponse } from '../gateway/protocol.js';

const SERVICE_NAME = 'hare-gateway.service';
const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789/ws';

export async function handleGatewayCommand(commandArgs: string[]): Promise<boolean> {
  const subcommand = commandArgs[0];
  if (!subcommand) {
    printGatewayUsage();
    return true;
  }

  if (subcommand === 'install') {
    await installService();
    await enableService();
    return true;
  }

  if (subcommand === 'start') {
    await runSystemctl(['start', SERVICE_NAME]);
    return true;
  }

  if (subcommand === 'stop') {
    await runSystemctl(['stop', SERVICE_NAME]);
    return true;
  }

  if (subcommand === 'restart') {
    await runSystemctl(['restart', SERVICE_NAME]);
    return true;
  }

  if (subcommand === 'uninstall') {
    await uninstallService();
    return true;
  }

  if (subcommand === 'status') {
    await printStatus();
    return true;
  }

  if (subcommand === 'foreground' || subcommand === '--foreground') {
    await runForeground();
    return false;
  }

  console.log(`Unknown gateway command: ${subcommand}`);
  printGatewayUsage();
  return true;
}

export async function isGatewayReady(): Promise<boolean> {
  const url = process.env.HARE_GATEWAY_URL || DEFAULT_GATEWAY_URL;
  const config = await loadConfig();
  const token = process.env.HARE_GATEWAY_TOKEN || config.gateway?.token;

  if (!token) {
    throw new Error('Gateway token missing. Run `hare setup` or set HARE_GATEWAY_TOKEN.');
  }

  try {
    await probeGateway(url, token);
    return true;
  } catch {
    return false;
  }
}

async function installService(): Promise<void> {
  const unitPath = getSystemdUnitPath();
  await fs.mkdir(path.dirname(unitPath), { recursive: true });
  const unitContent = await buildSystemdUnit();
  await fs.writeFile(unitPath, unitContent, 'utf-8');
  console.log(`Installed ${SERVICE_NAME} at ${unitPath}`);

  try {
    await runSystemctl(['daemon-reload']);
  } catch (error) {
    console.error(
      'Failed to reload systemd. You may need to run `systemctl --user daemon-reload` manually.'
    );
    throw error;
  }

  console.log('Service installed.');
}

async function enableService(): Promise<void> {
  try {
    await runSystemctl(['enable', '--now', SERVICE_NAME]);
    console.log('Gateway service enabled and started.');
  } catch (error) {
    console.error('Failed to enable the gateway service.');
    throw error;
  }
}

async function uninstallService(): Promise<void> {
  const unitPath = getSystemdUnitPath();
  try {
    await runSystemctl(['stop', SERVICE_NAME]);
  } catch {
    // ignore
  }
  try {
    await runSystemctl(['disable', SERVICE_NAME]);
  } catch {
    // ignore
  }
  await fs.rm(unitPath, { force: true });
  await runSystemctl(['daemon-reload']);
  console.log(`Removed ${SERVICE_NAME}`);
}

async function buildSystemdUnit(): Promise<string> {
  const execStart = resolveExecStart();
  const workingDir = resolveWorkingDirectory();
  const config = await loadConfig();
  if (!config.gateway?.token) {
    console.log('Gateway token is missing. Run `hare setup` or `hare token rotate` first.');
  }

  return `[Unit]
Description=Hare Gateway
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${execStart}
Restart=always
RestartSec=5
WorkingDirectory=${workingDir}

[Install]
WantedBy=default.target
`;
}

function resolveExecStart(): string {
  const nodePath = process.execPath;
  const cliPath = path.resolve(process.argv[1]);
  const repoRoot = path.resolve(path.dirname(cliPath), '..', '..');

  const tsxCandidates = [
    path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.js'),
  ];
  const tsxPath = tsxCandidates.find((candidate) => fsSync.existsSync(candidate));
  if (!tsxPath && cliPath.endsWith('.ts')) {
    throw new Error('tsx runtime not found. Run `npm install` in the repo first.');
  }

  const args = cliPath.endsWith('.ts')
    ? [nodePath, tsxPath as string, cliPath, 'gateway', '--foreground']
    : [nodePath, cliPath, 'gateway', '--foreground'];
  return args.map(quoteSystemdArg).join(' ');
}

function resolveWorkingDirectory(): string {
  const cliPath = path.resolve(process.argv[1]);
  return path.resolve(path.dirname(cliPath), '..', '..');
}

function getSystemdUnitPath(): string {
  return path.join(os.homedir(), '.config', 'systemd', 'user', SERVICE_NAME);
}

function quoteSystemdArg(value: string): string {
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/["\\]/g, '\\$&')}"`;
}

async function runForeground(): Promise<void> {
  await import('../gateway/server.js');
}

async function printStatus(): Promise<void> {
  const url = process.env.HARE_GATEWAY_URL || DEFAULT_GATEWAY_URL;
  const config = await loadConfig();
  const token = process.env.HARE_GATEWAY_TOKEN || config.gateway?.token;

  if (!token) {
    console.log('Gateway token missing. Run `hare setup` or set HARE_GATEWAY_TOKEN.');
    return;
  }

  const systemdStatus = await getSystemdStatus();
  if (systemdStatus) {
    console.log(`systemd: ${systemdStatus}`);
  }

  try {
    const hello = await probeGateway(url, token);
    console.log(`gateway: ok (protocol ${hello.protocol})`);
  } catch (error: any) {
    console.log(`gateway: unreachable (${error?.message || 'unknown error'})`);
  }
}

async function getSystemdStatus(): Promise<string | null> {
  try {
    const output = await runSystemctl(['is-active', SERVICE_NAME], { capture: true });
    return output.trim();
  } catch {
    return null;
  }
}

async function probeGateway(url: string, token: string): Promise<{ protocol: number }> {
  const socket = new WebSocket(url);
  await waitForOpen(socket);
  socket.send(
    JSON.stringify({
      type: 'req',
      id: 'status-connect',
      method: 'connect',
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: 'hare-status',
          version: '0.0.0',
          platform: process.platform,
          mode: 'operator',
        },
        role: 'operator',
        scopes: ['operator.read'],
        auth: { token },
      },
    })
  );

  const response = await waitForResponse(socket, 'status-connect');
  socket.close();

  if (!response.ok) {
    throw new Error(response.error?.message || 'Gateway rejected status check.');
  }

  const payload = response.payload as { protocol?: number } | undefined;
  return { protocol: payload?.protocol ?? PROTOCOL_VERSION };
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === socket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
}

function waitForResponse(socket: WebSocket, expectedId: string): Promise<GatewayResponse> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: Buffer) => {
      let parsed: GatewayFrame;
      try {
        parsed = JSON.parse(raw.toString()) as GatewayFrame;
      } catch {
        return;
      }

      if (parsed.type !== 'res') return;
      if (parsed.id !== expectedId) return;

      socket.off('message', onMessage);
      socket.off('error', onError);
      resolve(parsed as GatewayResponse);
    };

    const onError = (err: Error) => {
      socket.off('message', onMessage);
      socket.off('error', onError);
      reject(err);
    };

    socket.on('message', onMessage);
    socket.on('error', onError);
  });
}

type SystemctlOptions = {
  capture?: boolean;
};

function runSystemctl(args: string[], options: SystemctlOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('systemctl', ['--user', ...args], {
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });

    let stdout = '';
    let stderr = '';

    if (options.capture) {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr || `systemctl exited with code ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function printGatewayUsage(): void {
  console.log(`
Gateway commands:
  hare gateway install
  hare gateway uninstall
  hare gateway start
  hare gateway stop
  hare gateway restart
  hare gateway status
  hare gateway foreground
`);
}
