import { loadConfig } from '@core/config.js';
import { probeGateway } from '@cli/gateway/probe.js';
import {
  installService,
  enableService,
  uninstallService,
  startService,
  stopService,
  restartService,
  getSystemdStatus,
  runForeground,
} from '@cli/gateway/service.js';

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
    await startService();
    return true;
  }

  if (subcommand === 'stop') {
    await stopService();
    return true;
  }

  if (subcommand === 'restart') {
    await restartService();
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.log(`gateway: unreachable (${message})`);
  }
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
