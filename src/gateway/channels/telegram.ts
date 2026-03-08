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
      onMessage: async (msg) => {
        try {
          // Identify if this is a DM or a Group chat based on chatId
          // Telegram group chat IDs are usually negative numbers
          const isGroup = msg.chatId.startsWith('-');
          const chatType = isGroup ? 'group' : 'direct';

          return await runChannelAgent(msg.text, {
            sessionId: `telegram:${msg.chatId}`,
            channel: 'telegram',
            chatType,
            peerId: msg.chatId,
          });
        } catch (error: any) {
          const code = error?.code ? ` (${error.code})` : '';
          console.log(`[telegram] agent run failed for chat=${msg.chatId}: ${error?.message || 'unknown error'}${code}`);
          return "Sorry, I hit an internal error while processing your message. Please try again.";
        }
      },
      onLog: (line) => console.log(line),
    }
  );

  try {
    const me = await active.getMe();
    console.log(`[telegram] channel connected as @${me.username}`);
    active.start().catch((error: any) => {
      console.log(`[telegram] polling stopped: ${error?.message || 'unknown error'}`);
    });
  } catch (error: any) {
    console.log(
      `[telegram] failed to connect: ${error?.message || 'unknown error'}${
        error?.code ? ` (${error.code})` : ''
      }`
    );
    active = undefined;
  }
}

export async function stopTelegramChannel(): Promise<void> {
  if (!active) return;
  const current = active;
  active = undefined;
  await current.stop();
}

export async function broadcastTelegramMessage(message: string): Promise<void> {
  if (!active) return;
  const config = await loadConfig();
  const allowFrom = config.channels?.telegram?.allowFrom ?? [];
  for (const chatId of allowFrom) {
    try {
      await active.send(chatId, message);
    } catch (e: any) {
      console.error(`[telegram] Failed to broadcast to ${chatId}: ${e.message}`);
    }
  }
}
