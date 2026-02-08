import { Bot } from 'grammy';
import type { ChannelMessage } from './types.js';

export type TelegramConfig = {
  token: string;
  allowFrom?: string[];
  dmPolicy?: 'allowlist' | 'open' | 'disabled';
};

export type TelegramHandlers = {
  onMessage: (message: ChannelMessage) => Promise<string>;
  onLog?: (line: string) => void;
  onUnhandledMessage?: (message: ChannelMessage) => Promise<void> | void;
};

export class TelegramChannel {
  private bot: Bot;
  private allowFrom: Set<string>;
  private dmPolicy: 'allowlist' | 'open' | 'disabled';
  private handlers: TelegramHandlers;

  constructor(config: TelegramConfig, handlers: TelegramHandlers) {
    this.bot = new Bot(config.token);
    this.allowFrom = new Set(config.allowFrom ?? []);
    this.dmPolicy = config.dmPolicy ?? 'allowlist';
    this.handlers = handlers;

    this.bot.on('message:text', async (ctx) => {
      const from = ctx.from?.id?.toString();
      const chatId = ctx.chat?.id?.toString();
      const text = ctx.message?.text || '';

      if (!from || !chatId) return;
      if (!this.isAllowed(from)) {
        if (this.handlers.onUnhandledMessage) {
          await this.handlers.onUnhandledMessage({ text, from, chatId });
        }
        return;
      }

      this.handlers.onLog?.(`[telegram] inbound from=${from} chat=${chatId}`);
      const reply = await this.handlers.onMessage({ text, from, chatId });
      if (reply) {
        await ctx.reply(reply);
      }
    });
  }

  async start(): Promise<void> {
    await this.bot.start();
    this.handlers.onLog?.('[telegram] bot started');
  }

  async stop(): Promise<void> {
    await this.bot.stop();
    this.handlers.onLog?.('[telegram] bot stopped');
  }

  async send(to: string, message: string): Promise<void> {
    await this.bot.api.sendMessage(to, message);
  }

  private isAllowed(senderId: string): boolean {
    if (this.dmPolicy === 'disabled') return false;
    if (this.dmPolicy === 'open') return true;
    return this.allowFrom.has(senderId);
  }
}
