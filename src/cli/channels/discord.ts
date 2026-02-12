import { DiscordChannel } from '@channels/discord.js';
import { loadConfig, saveConfig } from '@core/config.js';
import { runPrompt } from '@cli/run.js';
import {
  PAIRING_TIMEOUT_MS,
  generatePairingCode,
  parseSendArgs,
  waitForShutdown,
} from '@cli/channels/shared.js';

export async function runDiscordCommand(
  commandArgs: string[],
  options: { local: boolean }
): Promise<boolean> {
  const subcommand = commandArgs[0];
  if (!subcommand) {
    printDiscordUsage();
    return true;
  }

  if (subcommand === 'status') {
    await printDiscordStatus();
    return true;
  }

  if (subcommand === 'send') {
    const { to, message } = parseSendArgs(commandArgs.slice(1));
    if (!to || !message) {
      printDiscordUsage();
      return true;
    }
    const channel = await createDiscordChannel(async () => '', options.local);
    await channel.start();
    await channel.send(to, message);
    await channel.stop();
    console.log('Sent.');
    return true;
  }

  if (subcommand === 'allow-me') {
    await runAllowMe();
    return true;
  }

  if (subcommand === 'start') {
    const channel = await createDiscordChannel(async (text) => {
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
    await waitForShutdown(async () => channel.stop());
    return false;
  }

  printDiscordUsage();
  return true;
}

async function createDiscordChannel(
  onMessage: (text: string) => Promise<string>,
  _local: boolean
) {
  const config = await loadConfig();
  const token = config.channels?.discord?.botToken || process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error(
      'Discord bot token missing. Set DISCORD_BOT_TOKEN or config.channels.discord.botToken.'
    );
  }

  const allowFrom = config.channels?.discord?.allowFrom ?? [];
  const dmPolicy = config.channels?.discord?.dmPolicy ?? 'allowlist';

  return new DiscordChannel(
    { token, allowFrom, dmPolicy },
    {
      onMessage: async (msg) => onMessage(msg.text),
      onLog: (line) => console.log(line),
    }
  );
}

async function runAllowMe(): Promise<void> {
  const config = await loadConfig();
  const token = config.channels?.discord?.botToken || process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error(
      'Discord bot token missing. Set DISCORD_BOT_TOKEN or config.channels.discord.botToken.'
    );
  }

  const pairingCode = generatePairingCode();
  console.log(`\nDiscord allow-me pairing code: ${pairingCode}`);
  console.log('Send this code to your bot in a DM within 5 minutes.\n');

  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const channel = new DiscordChannel(
    { token, allowFrom: [], dmPolicy: 'open' },
    {
      onMessage: async (msg) => {
        if (msg.text.trim() !== pairingCode) return '';
        await storeAllowFrom(msg.from);
        console.log(`Approved discord user id: ${msg.from}`);
        await channel.stop();
        resolveDone?.();
        return '';
      },
      onLog: (line) => console.log(line),
    }
  );

  const timeout = setTimeout(async () => {
    console.log('Pairing timed out.');
    await channel.stop();
    resolveDone?.();
  }, PAIRING_TIMEOUT_MS);

  try {
    await channel.start();
    await Promise.race([done, waitForShutdown(async () => channel.stop())]);
  } finally {
    clearTimeout(timeout);
  }
}

async function storeAllowFrom(userId: string): Promise<void> {
  const config = await loadConfig();
  const allowFrom = new Set(config.channels?.discord?.allowFrom ?? []);
  allowFrom.add(userId);
  config.channels = {
    ...(config.channels ?? {}),
    discord: {
      ...(config.channels?.discord ?? {}),
      allowFrom: Array.from(allowFrom),
      dmPolicy: 'allowlist',
      enabled: true,
    },
  };
  await saveConfig(config);
}

async function printDiscordStatus() {
  const config = await loadConfig();
  const token = config.channels?.discord?.botToken || process.env.DISCORD_BOT_TOKEN;
  const enabled = Boolean(token) && (config.channels?.discord?.enabled ?? true);
  console.log(`discord: ${enabled ? 'configured' : 'not configured'}`);
}

function printDiscordUsage() {
  console.log(`\nDiscord commands:\n  hare discord status\n  hare discord start\n  hare discord allow-me\n  hare discord send --to <userId> --message \"text\"\n`);
}
