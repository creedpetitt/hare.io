import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { loadConfig } from '@core/config.js';

const SERVICE_NAME = 'hare-gateway.service';

export async function installService(): Promise<void> {
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

export async function enableService(): Promise<void> {
  try {
    await runSystemctl(['enable', '--now', SERVICE_NAME]);
    console.log('Gateway service enabled and started.');
  } catch (error) {
    console.error('Failed to enable the gateway service.');
    throw error;
  }
}

export async function uninstallService(): Promise<void> {
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

export async function startService(): Promise<void> {
  await runSystemctl(['start', SERVICE_NAME]);
}

export async function stopService(): Promise<void> {
  await runSystemctl(['stop', SERVICE_NAME]);
}

export async function restartService(): Promise<void> {
  await runSystemctl(['restart', SERVICE_NAME]);
}

export async function getSystemdStatus(): Promise<string | null> {
  try {
    const output = await runSystemctl(['is-active', SERVICE_NAME], { capture: true });
    return output.trim();
  } catch {
    return null;
  }
}

export async function runForeground(): Promise<void> {
  await import('@gateway/server.js');
}

// --- internal helpers ---

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
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr?.on('data', (data: Buffer) => {
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
