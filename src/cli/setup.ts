import crypto from 'crypto';
import { confirm, password, select } from '@inquirer/prompts';
import { Message } from '../core/types.js';
import { OpenAIProvider } from '../core/llm/OpenAIProvider.js';
import { AnthropicProvider } from '../core/llm/AnthropicProvider.js';
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  type AppConfig,
  type ProviderId,
} from '../core/config.js';

async function validateOpenAI(apiKey: string): Promise<boolean> {
  try {
    const provider = new OpenAIProvider(apiKey, DEFAULT_OPENAI_MODEL);
    await provider.generate('Hello', []);
    return true;
  } catch (e: any) {
    console.log(e?.message || 'OpenAI validation failed.');
    return false;
  }
}

async function validateAnthropic(apiKey: string): Promise<boolean> {
  try {
    const provider = new AnthropicProvider(apiKey, DEFAULT_ANTHROPIC_MODEL);
    const history: Message[] = [{ role: 'user', content: 'ping', timestamp: Date.now() }];
    await provider.generate('Hello', history);
    return true;
  } catch (e: any) {
    console.log(e?.message || 'Anthropic validation failed.');
    return false;
  }
}

function generateGatewayToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function ensureGatewayToken(config: AppConfig): AppConfig {
  if (!config.gateway?.token) {
    config.gateway = { ...(config.gateway ?? {}), token: generateGatewayToken() };
  }
  return config;
}

function getProviderStatus(config: AppConfig) {
  return {
    openaiConfigured: Boolean(config.providers?.openai?.apiKey),
    anthropicConfigured: Boolean(config.providers?.anthropic?.apiKey),
  };
}

async function promptProviderSelection(openaiConfigured: boolean, anthropicConfigured: boolean) {
  return (await select({
    message: 'Which AI provider do you want to configure?',
    choices: [
      {
        name: 'OpenAI',
        value: 'openai',
        description: openaiConfigured ? 'Configured' : 'Not configured',
      },
      {
        name: 'Anthropic',
        value: 'anthropic',
        description: anthropicConfigured ? 'Configured' : 'Not configured',
      },
      {
        name: 'Cancel',
        value: 'cancel',
        description: 'Exit setup without changes',
      },
    ],
  })) as ProviderId | 'cancel';
}

async function shouldReplaceProvider(config: AppConfig, provider: ProviderId): Promise<boolean> {
  const configured = Boolean(config.providers?.[provider]?.apiKey);
  if (!configured) return true;

  return await confirm({
    message: `${provider} is already configured. Replace the API key?`,
    default: false,
  });
}

async function promptForApiKey(provider: ProviderId): Promise<string> {
  let isValid = false;
  let apiKey = '';

  while (!isValid) {
    apiKey = await password({
      message: `Paste your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key:`,
      mask: '*',
    });

    process.stdout.write('🔍 Validating key... ');
    isValid =
      provider === 'openai' ? await validateOpenAI(apiKey) : await validateAnthropic(apiKey);

    if (isValid) {
      console.log('Success!');
    } else {
      console.log('Invalid Key. Please try again.');
    }
  }

  return apiKey;
}

function applyProviderKey(config: AppConfig, provider: ProviderId, apiKey: string): AppConfig {
  const defaultModel = provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;
  const existingProvider = config.providers?.[provider];

  config.providers = {
    ...(config.providers ?? {}),
    [provider]: {
      ...(existingProvider ?? {}),
      apiKey,
      model: existingProvider?.model || defaultModel,
    },
  };

  return config;
}

function ensureDefaultProvider(config: AppConfig, provider: ProviderId): AppConfig {
  if (!config.defaults?.provider) {
    config.defaults = { ...(config.defaults ?? {}), provider };
  }
  return config;
}

function resolveEnvKeys(config: AppConfig) {
  const envOpenAI = process.env.OPENAI_API_KEY;
  const envAnthropic = process.env.ANTHROPIC_API_KEY;
  const openaiKey = config.providers?.openai?.apiKey || envOpenAI;
  const anthropicKey = config.providers?.anthropic?.apiKey || envAnthropic;
  return { openaiKey, anthropicKey };
}

function selectNonInteractiveProvider(
  preferred: ProviderId | undefined,
  openaiKey?: string,
  anthropicKey?: string
): ProviderId {
  if (preferred === 'openai' && openaiKey) return 'openai';
  if (preferred === 'anthropic' && anthropicKey) return 'anthropic';
  if (openaiKey) return 'openai';
  return 'anthropic';
}

async function validateProviderKey(provider: ProviderId, apiKey: string): Promise<void> {
  const ok = provider === 'openai' ? await validateOpenAI(apiKey) : await validateAnthropic(apiKey);
  if (!ok) {
    throw new Error(`${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key validation failed.`);
  }
}

export async function rotateGatewayToken(): Promise<void> {
  const config = await loadConfig();
  config.gateway = { ...(config.gateway ?? {}), token: generateGatewayToken() };
  await saveConfig(config);
  console.log(`Gateway token rotated. Update clients using ${getConfigPath()}\n`);
}

export async function setProviderModel(provider: ProviderId, model: string): Promise<void> {
  const config = await loadConfig();
  const providerConfig = config.providers?.[provider] ?? {};

  config.providers = {
    ...(config.providers ?? {}),
    [provider]: {
      ...providerConfig,
      model,
    },
  };

  await saveConfig(config);
  if (!providerConfig.apiKey) {
    console.log(`Model saved, but ${provider} has no API key yet.`);
    console.log('Run `hare setup` to add the key.\n');
    return;
  }
  console.log(`Model updated for ${provider}. Saved to ${getConfigPath()}\n`);
}

export async function setDefaultProvider(provider: ProviderId): Promise<void> {
  const config = await loadConfig();
  config.defaults = { ...(config.defaults ?? {}), provider };
  await saveConfig(config);
  console.log(`Default provider set to ${provider}. Saved to ${getConfigPath()}\n`);
}

export async function showCurrentProvider(): Promise<void> {
  const config = await loadConfig();
  const provider = config.defaults?.provider;
  if (!provider) {
    console.log('No default provider set.');
    return;
  }
  const model = config.providers?.[provider]?.model;
  console.log(`Default provider: ${provider}${model ? ` (${model})` : ''}`);
}

export async function ensureAuthenticated(force = false) {
  let config = await loadConfig();
  config = ensureGatewayToken(config);

  const { openaiConfigured, anthropicConfigured } = getProviderStatus(config);
  if (!force && (openaiConfigured || anthropicConfigured)) {
    await saveConfig(config);
    return;
  }

  console.log("\n🐰 Welcome to Harebot! Let's get you set up.\n");

  const provider = await promptProviderSelection(openaiConfigured, anthropicConfigured);
  if (provider === 'cancel') {
    await saveConfig(config);
    console.log('Setup cancelled. No changes made.\n');
    return;
  }

  const shouldReplace = await shouldReplaceProvider(config, provider);
  if (!shouldReplace) {
    await saveConfig(config);
    console.log('No changes made.\n');
    return;
  }

  const apiKey = await promptForApiKey(provider);
  config = applyProviderKey(config, provider, apiKey);
  config = ensureDefaultProvider(config, provider);

  await saveConfig(config);
  console.log(`Saved configuration to ${getConfigPath()}\n`);
}

export async function ensureAuthenticatedNonInteractive(): Promise<void> {
  let config = await loadConfig();
  config = ensureGatewayToken(config);

  const { openaiKey, anthropicKey } = resolveEnvKeys(config);
  if (!openaiKey && !anthropicKey) {
    throw new Error(
      'No provider API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or run `hare setup`.'
    );
  }

  const providerToUse = selectNonInteractiveProvider(
    config.defaults?.provider,
    openaiKey,
    anthropicKey
  );
  const keyToValidate = providerToUse === 'openai' ? openaiKey : anthropicKey;
  if (keyToValidate) {
    await validateProviderKey(providerToUse, keyToValidate);
  }

  if (openaiKey) {
    config = applyProviderKey(config, 'openai', openaiKey);
  }
  if (anthropicKey) {
    config = applyProviderKey(config, 'anthropic', anthropicKey);
  }

  config = ensureDefaultProvider(config, providerToUse);

  await saveConfig(config);
}
