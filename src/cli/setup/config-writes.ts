import crypto from 'crypto';
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  type AppConfig,
  type ProviderId,
} from '@core/config.js';

export function generateGatewayToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function ensureGatewayToken(config: AppConfig): AppConfig {
  if (!config.gateway?.token) {
    config.gateway = { ...(config.gateway ?? {}), token: generateGatewayToken() };
  }
  return config;
}

export function getProviderStatus(config: AppConfig) {
  return {
    openaiConfigured: Boolean(config.providers?.openai?.apiKey),
    anthropicConfigured: Boolean(config.providers?.anthropic?.apiKey),
    geminiConfigured: Boolean(config.providers?.gemini?.apiKey),
    braveConfigured: Boolean(config.tools?.web?.search?.apiKey),
    telegramConfigured: Boolean(config.channels?.telegram?.botToken),
    discordConfigured: Boolean(config.channels?.discord?.botToken),
  };
}

export function applyProviderKey(
  config: AppConfig,
  provider: ProviderId,
  apiKey: string,
  modelOverride?: string,
  apiVersion?: string
): AppConfig {
  const defaultModel =
    provider === 'openai'
      ? DEFAULT_OPENAI_MODEL
      : provider === 'anthropic'
        ? DEFAULT_ANTHROPIC_MODEL
        : DEFAULT_GEMINI_MODEL;
  const existingProvider = config.providers?.[provider];

  config.providers = {
    ...(config.providers ?? {}),
    [provider]: {
      ...(existingProvider ?? {}),
      apiKey,
      model: modelOverride || existingProvider?.model || defaultModel,
      apiVersion: apiVersion || existingProvider?.apiVersion,
    },
  };

  return config;
}

export function applyBraveKey(config: AppConfig, apiKey: string): AppConfig {
  config.tools = {
    ...(config.tools ?? {}),
    web: {
      ...(config.tools?.web ?? {}),
      search: {
        ...(config.tools?.web?.search ?? {}),
        provider: 'brave',
        apiKey,
      },
    },
  };
  return config;
}

export function applyTelegramToken(config: AppConfig, token: string): AppConfig {
  config.channels = {
    ...(config.channels ?? {}),
    telegram: {
      ...(config.channels?.telegram ?? {}),
      enabled: true,
      botToken: token,
    },
  };
  return config;
}

export function applyDiscordToken(config: AppConfig, token: string): AppConfig {
  config.channels = {
    ...(config.channels ?? {}),
    discord: {
      ...(config.channels?.discord ?? {}),
      enabled: true,
      botToken: token,
    },
  };
  return config;
}

export function ensureDefaultProvider(config: AppConfig, provider: ProviderId): AppConfig {
  if (!config.defaults?.provider) {
    config.defaults = { ...(config.defaults ?? {}), provider };
  }
  return config;
}

export function resolveEnvKeys(config: AppConfig) {
  const envOpenAI = process.env.OPENAI_API_KEY;
  const envAnthropic = process.env.ANTHROPIC_API_KEY;
  const envGemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const envBrave = process.env.BRAVE_API_KEY;
  const envTelegram = process.env.TELEGRAM_BOT_TOKEN;
  const envDiscord = process.env.DISCORD_BOT_TOKEN;
  const openaiKey = config.providers?.openai?.apiKey || envOpenAI;
  const anthropicKey = config.providers?.anthropic?.apiKey || envAnthropic;
  const geminiKey = config.providers?.gemini?.apiKey || envGemini;
  const braveKey = config.tools?.web?.search?.apiKey || envBrave;
  const telegramToken = config.channels?.telegram?.botToken || envTelegram;
  const discordToken = config.channels?.discord?.botToken || envDiscord;
  return { openaiKey, anthropicKey, geminiKey, braveKey, telegramToken, discordToken };
}

export function selectNonInteractiveProvider(
  preferred: ProviderId | undefined,
  openaiKey?: string,
  anthropicKey?: string,
  geminiKey?: string
): ProviderId {
  if (preferred === 'openai' && openaiKey) return 'openai';
  if (preferred === 'anthropic' && anthropicKey) return 'anthropic';
  if (preferred === 'gemini' && geminiKey) return 'gemini';
  if (openaiKey) return 'openai';
  if (anthropicKey) return 'anthropic';
  return 'gemini';
}
