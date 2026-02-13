import { TelegramChannel } from '../../channels/telegram.js';
import { loadConfig } from '../../core/config.js';
import { runChannelAgent } from './runner.js';

let active: TelegramChannel | undefined;

export async function startTelegramChannel(): Promise<void> {
  const config = await loadConfig();
  const telegramConfig = config.channels?.telegram;
  const token = telegramConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const enabled = telegramConfig?.enabled ?? true;

  if (!enabled) {
    console.log('[telegram] channel disabled via config');
    return;
  }
  if (!token) {
    console.log('[telegram] bot token missing; channel not started');
    return;
  }
  if (active) return;

  const allowFrom = telegramConfig?.allowFrom ?? [];
  const dmPolicy = telegramConfig?.dmPolicy ?? 'allowlist';

  active = new TelegramChannel(
    { token, allowFrom, dmPolicy },
    {
      onMessage: async (msg) => runChannelAgent(msg.text, { agentId: 'main', sessionId: 'main' }),
      onLog: (line) => console.log(line),
    }
  );

  active.start().catch((error: any) => {
    console.log(
      `[telegram] failed to start: ${error?.message || 'unknown error'}${
        error?.code ? ` (${error.code})` : ''
      }`
    );
    active = undefined;
  });
}

export async function stopTelegramChannel(): Promise<void> {
  if (!active) return;
  const current = active;
  active = undefined;
  await current.stop();
}
