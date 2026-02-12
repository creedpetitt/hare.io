import { DiscordChannel } from '../../channels/discord.js';
import { loadConfig } from '../../core/config.js';
import { runPrompt } from '@runtime/chat.js';

let active: DiscordChannel | undefined;

export async function startDiscordChannel(): Promise<void> {
  const config = await loadConfig();
  const discordConfig = config.channels?.discord;
  const token = discordConfig?.botToken || process.env.DISCORD_BOT_TOKEN;
  const enabled = discordConfig?.enabled ?? true;

  if (!enabled) {
    console.log('[discord] channel disabled via config');
    return;
  }
  if (!token) {
    console.log('[discord] bot token missing; channel not started');
    return;
  }
  if (active) return;

  const allowFrom = discordConfig?.allowFrom ?? [];
  const dmPolicy = discordConfig?.dmPolicy ?? 'allowlist';

  active = new DiscordChannel(
    { token, allowFrom, dmPolicy },
    {
      onMessage: async (msg) =>
        runPrompt(msg.text, {
          agentId: 'main',
          profile: undefined,
          local: true,
          gatewayUrl: 'ws://127.0.0.1:18789/ws',
          gatewayToken: config.gateway?.token,
        }),
      onLog: (line) => console.log(line),
    }
  );

  active.start().catch((error: any) => {
    console.log(
      `[discord] failed to start: ${error?.message || 'unknown error'}${
        error?.code ? ` (${error.code})` : ''
      }`
    );
    active = undefined;
  });
}

export async function stopDiscordChannel(): Promise<void> {
  if (!active) return;
  const current = active;
  active = undefined;
  await current.stop();
}
