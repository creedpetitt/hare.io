import { DiscordChannel } from '../../channels/discord.js';
import { loadConfig } from '../../core/config.js';
import { runChannelAgent } from './runner.js';

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
      onMessage: async (msg) => {
        try {
          return await runChannelAgent(msg.text, {
            agentId: 'main',
            sessionId: `discord:${msg.chatId}`,
          });
        } catch (error: any) {
          const code = error?.code ? ` (${error.code})` : '';
          console.log(`[discord] agent run failed for chat=${msg.chatId}: ${error?.message || 'unknown error'}${code}`);
          return "Sorry, I hit an internal error while processing your message. Please try again.";
        }
      },
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

export async function broadcastDiscordMessage(message: string): Promise<void> {
  if (!active) return;
  const config = await loadConfig();
  const allowFrom = config.channels?.discord?.allowFrom ?? [];
  for (const userId of allowFrom) {
    try {
      await active.send(userId, message);
    } catch (e: any) {
      console.error(`[discord] Failed to broadcast to ${userId}: ${e.message}`);
    }
  }
}
