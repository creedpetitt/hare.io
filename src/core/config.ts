import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { ToolPolicyConfig } from './types.js';

export type ProviderId = 'openai' | 'anthropic';

export type ProviderConfig = {
  apiKey?: string;
  model?: string;
};

export type AppConfig = {
  gateway?: {
    token?: string;
  };
  tools?: {
    policy?: ToolPolicyConfig;
  };
  providers?: Partial<Record<ProviderId, ProviderConfig>>;
  defaults?: {
    provider?: ProviderId;
  };
};

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-haiku-20240307';

export const CONFIG_DIR = path.join(os.homedir(), '.hareio');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'hare.json');

export function normalizeConfig(config: AppConfig): AppConfig {
  const providers = config.providers ?? {};
  return {
    gateway: { ...config.gateway },
    tools: { ...config.tools, policy: config.tools?.policy },
    defaults: { ...config.defaults },
    providers: {
      openai: { ...providers.openai },
      anthropic: { ...providers.anthropic },
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
