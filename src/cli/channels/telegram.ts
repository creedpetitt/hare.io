import { TelegramChannel } from '@channels/telegram.js';
import { loadConfig, saveConfig } from '@core/config.js';
import { runPrompt } from '@cli/run.js';
import { PAIRING_TIMEOUT_MS, generatePairingCode, parseSendArgs } from '@cli/channels/shared.js';

export async function runTelegramCommand(
  commandArgs: string[],
  options: { local: boolean }
): Promise<boolean> {
  const subcommand = commandArgs[0];
  if (!subcommand) {
    printTelegramUsage();
    return true;
  }

  if (subcommand === 'status') {
    await printTelegramStatus();
    return true;
  }

  if (subcommand === 'send') {
    const { to, message } = parseSendArgs(commandArgs.slice(1));
    if (!to || !message) {
      printTelegramUsage();
      return true;
    }
    const channel = await createTelegramChannel(async () => '', options.local);
    await channel.send(to, message);
    console.log('Sent.');
    return true;
  }

  if (subcommand === 'allow-me') {
    await runAllowMe();
    return true;
  }

  if (subcommand === 'start') {
    const channel = await createTelegramChannel(async (text) => {
      const response = await runPrompt(text, {
        agentId: 'main',
        profile: undefined,
        local: options.local,
        gatewayUrl: process.env.HARE_GATEWAY_URL || 'ws://127.0.0.1:18789/ws',
        gatewayToken: process.env.HARE_GATEWAY_TOKEN,
      });
      return response;
    }, options.local);

    await channel.start();
    return false;
  }

  printTelegramUsage();
  return true;
}

async function createTelegramChannel(
  onMessage: (text: string) => Promise<string>,
  _local: boolean
) {
  const config = await loadConfig();
  const token = config.channels?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      'Telegram bot token missing. Set TELEGRAM_BOT_TOKEN or config.channels.telegram.botToken.'
    );
  }

  const allowFrom = config.channels?.telegram?.allowFrom ?? [];
  const dmPolicy = config.channels?.telegram?.dmPolicy ?? 'allowlist';

  return new TelegramChannel(
    { token, allowFrom, dmPolicy },
    {
      onMessage: async (msg) => onMessage(msg.text),
      onLog: (line) => console.log(line),
    }
  );
}

async function runAllowMe(): Promise<void> {
  const config = await loadConfig();
  const token = config.channels?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      'Telegram bot token missing. Set TELEGRAM_BOT_TOKEN or config.channels.telegram.botToken.'
    );
  }

  const pairingCode = generatePairingCode();
  console.log(`\nTelegram allow-me pairing code: ${pairingCode}`);
  console.log('Send this code to your bot in a DM within 5 minutes.\n');

  const channel = new TelegramChannel(
    { token, allowFrom: [], dmPolicy: 'open' },
    {
      onMessage: async (msg) => {
        if (msg.text.trim() !== pairingCode) return '';
        await storeAllowFrom(msg.from);
        console.log(`Approved telegram user id: ${msg.from}`);
        await channel.stop();
        return '';
      },
      onLog: (line) => console.log(line),
    }
  );

  const timeout = setTimeout(async () => {
    console.log('Pairing timed out.');
    await channel.stop();
  }, PAIRING_TIMEOUT_MS);

  try {
    await channel.start();
  } finally {
    clearTimeout(timeout);
  }
}

async function storeAllowFrom(userId: string): Promise<void> {
  const config = await loadConfig();
  const allowFrom = new Set(config.channels?.telegram?.allowFrom ?? []);
  allowFrom.add(userId);
  config.channels = {
    ...(config.channels ?? {}),
    telegram: {
      ...(config.channels?.telegram ?? {}),
      allowFrom: Array.from(allowFrom),
      dmPolicy: 'allowlist',
      enabled: true,
    },
  };
  await saveConfig(config);
}

async function printTelegramStatus() {
  const config = await loadConfig();
  const token = config.channels?.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const enabled = Boolean(token) && (config.channels?.telegram?.enabled ?? true);
  console.log(`telegram: ${enabled ? 'configured' : 'not configured'}`);
}

function printTelegramUsage() {
  console.log(`\nTelegram commands:\n  hare telegram status\n  hare telegram start\n  hare telegram allow-me\n  hare telegram send --to <chatId> --message "text"\n`);
}
