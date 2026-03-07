import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
} from 'discord.js';
import type { ChannelMessage } from './types.js';

export type DiscordConfig = {
  token: string;
  allowFrom?: string[];
  dmPolicy?: 'allowlist' | 'open' | 'disabled';
};

export type DiscordHandlers = {
  onMessage: (message: ChannelMessage) => Promise<string>;
  onLog?: (line: string) => void;
  onUnhandledMessage?: (message: ChannelMessage) => Promise<void> | void;
};

export class DiscordChannel {
  private client: Client;
  private token: string;
  private allowFrom: Set<string>;
  private dmPolicy: 'allowlist' | 'open' | 'disabled';
  private handlers: DiscordHandlers;

  constructor(config: DiscordConfig, handlers: DiscordHandlers) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });
    this.token = config.token;
    this.allowFrom = new Set(config.allowFrom ?? []);
    this.dmPolicy = config.dmPolicy ?? 'allowlist';
    this.handlers = handlers;

    this.client.on('messageCreate', async (message: Message) => {
      if (message.author?.bot) return;
      if (message.channel.type !== ChannelType.DM) return;
      if (!message.author?.id || !message.channel?.id) return;

      const from = message.author.id;
      const chatId = message.channel.id;
      const text = message.content ?? '';

      if (!this.isAllowed(from)) {
        this.handlers.onLog?.(`[discord] ignored message from unallowed user=${from}`);
        if (this.handlers.onUnhandledMessage) {
          await this.handlers.onUnhandledMessage({ text, from, chatId });
        }
        return;
      }

      this.handlers.onLog?.(`[discord] inbound from=${from} chat=${chatId}`);
      const reply = await this.handlers.onMessage({ text, from, chatId });
      if (reply) {
        await message.channel.send(reply);
      }
    });
  }

  async start(): Promise<void> {
    await this.loginWithTimeout(15000);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  async send(to: string, message: string): Promise<void> {
    const user = await this.client.users.fetch(to);
    await user.send(message);
  }

  private isAllowed(senderId: string): boolean {
    if (this.dmPolicy === 'disabled') return false;
    if (this.dmPolicy === 'open') return true;
    return this.allowFrom.has(senderId);
  }

  private async loginWithTimeout(timeoutMs: number): Promise<void> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error('Discord login timed out');
        (err as any).code = 'DISCORD_LOGIN_TIMEOUT';
        reject(err);
      }, timeoutMs);
    });

    try {
      await Promise.race([this.client.login(this.token), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

}
