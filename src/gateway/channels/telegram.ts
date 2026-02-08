import { TelegramChannel } from '../../channels/telegram.js';
import { loadConfig } from '../../core/config.js';
import { runPrompt } from '../../cli/run.js';

let active: TelegramChannel | undefined;

export async function startTelegramChannel(): Promise<void> {
  const config = await loadConfig();
  const telegramConfig = config.channels?.telegram;
  const token = telegramConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const enabled = telegramConfig?.enabled ?? true;

  if (!enabled || !token) return;
  if (active) return;

  const allowFrom = telegramConfig?.allowFrom ?? [];
  const dmPolicy = telegramConfig?.dmPolicy ?? 'allowlist';

  active = new TelegramChannel(
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

  await active.start();
}

export async function stopTelegramChannel(): Promise<void> {
  if (!active) return;
  const current = active;
  active = undefined;
  await current.stop();
}
