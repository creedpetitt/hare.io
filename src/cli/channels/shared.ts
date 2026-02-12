import crypto from 'crypto';

export const PAIRING_TIMEOUT_MS = 5 * 60 * 1000;

export function generatePairingCode(): string {
  return crypto.randomBytes(3).toString('hex');
}

export function parseSendArgs(args: string[]): { to?: string; message?: string } {
  let to: string | undefined;
  let message: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--to' && args[i + 1]) {
      to = args[i + 1];
      i++;
      continue;
    }
    if (token === '--message' && args[i + 1]) {
      message = args[i + 1];
      i++;
      continue;
    }
  }
  return { to, message };
}

export function waitForShutdown(onShutdown: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const handler = async () => {
      await onShutdown();
      resolve();
    };
    process.once('SIGINT', handler);
    process.once('SIGTERM', handler);
  });
}
