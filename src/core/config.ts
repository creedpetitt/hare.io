import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { ToolPolicyConfig } from './types.js';

export type ProviderId = 'openai' | 'anthropic' | 'gemini';

export type ProviderConfig = {
  apiKey?: string;
  model?: string;
  apiVersion?: string;
};

export type AppConfig = {
  gateway?: {
    token?: string;
  };
  tools?: {
    policy?: ToolPolicyConfig;
    web?: {
      search?: {
        provider?: 'brave';
        apiKey?: string;
        timeoutMs?: number;
        maxResults?: number;
        maxResultsCap?: number;
        cacheTtlMs?: number;
        country?: string;
        searchLang?: string;
      };
    };
  };
  channels?: {
    telegram?: {
      enabled?: boolean;
      botToken?: string;
      allowFrom?: string[];
      dmPolicy?: 'allowlist' | 'open' | 'disabled';
    };
    discord?: {
      enabled?: boolean;
      botToken?: string;
      allowFrom?: string[];
      dmPolicy?: 'allowlist' | 'open' | 'disabled';
    };
  };
  agents?: {
    defaults?: {
      bootstrapMaxChars?: number;
      maxToolIterations?: number;
      skills?: {
        autoActivate?: boolean;
        maxActive?: number;
        maxCharsPerSkill?: number;
      };
    };
  };
  providers?: Partial<Record<ProviderId, ProviderConfig>>;
  defaults?: {
    provider?: ProviderId;
  };
};

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-haiku-20240307';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export const CONFIG_DIR = path.join(os.homedir(), '.hareio');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'hare.json');

export function normalizeConfig(config: AppConfig): AppConfig {
  const providers = config.providers ?? {};
  const agents = config.agents ?? {};
  const agentDefaults = agents.defaults ?? {};
  const agentSkills = agentDefaults.skills ?? {};
  const tools = config.tools ?? {};
  const toolsWeb = tools.web ?? {};
  const toolsWebSearch = toolsWeb.search ?? {};
  const channels = config.channels ?? {};
  const channelsTelegram = channels.telegram ?? {};
  const channelsDiscord = channels.discord ?? {};
  return {
    gateway: { ...config.gateway },
    tools: {
      ...tools,
      policy: tools.policy,
      web: {
        ...toolsWeb,
        search: {
          ...toolsWebSearch,
        },
      },
    },
    channels: {
      ...channels,
      telegram: {
        ...channelsTelegram,
      },
      discord: {
        ...channelsDiscord,
      },
    },
    defaults: { ...config.defaults },
    agents: {
      ...agents,
      defaults: {
        ...agentDefaults,
        skills: { ...agentSkills },
      },
    },
    providers: {
      openai: { ...providers.openai },
      anthropic: { ...providers.anthropic },
      gemini: { ...providers.gemini },
    },
  };
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AppConfig;
    return normalizeConfig(parsed);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return normalizeConfig({});
    }
    throw error;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const normalized = normalizeConfig(config);
  const content = JSON.stringify(normalized, null, 2) + '\n';
  await fs.writeFile(CONFIG_FILE, content, { mode: 0o600 });
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
