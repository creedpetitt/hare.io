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
  const config = await loadConfig();

  if (!config.gateway?.token) {
    config.gateway = { ...(config.gateway ?? {}), token: generateGatewayToken() };
  }

  const openaiConfigured = Boolean(config.providers?.openai?.apiKey);
  const anthropicConfigured = Boolean(config.providers?.anthropic?.apiKey);

  if (!force && (openaiConfigured || anthropicConfigured)) {
    await saveConfig(config);
    return;
  }

  console.log("\n🐰 Welcome to Harebot! Let's get you set up.\n");

  const provider = (await select({
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

  if (provider === 'cancel') {
    await saveConfig(config);
    console.log('Setup cancelled. No changes made.\n');
    return;
  }

  const configured = Boolean(config.providers?.[provider]?.apiKey);
  if (configured) {
    const shouldReplace = await confirm({
      message: `${provider} is already configured. Replace the API key?`,
      default: false,
    });
    if (!shouldReplace) {
      await saveConfig(config);
      console.log('No changes made.\n');
      return;
    }
  }

  const existingProvider = config.providers?.[provider];
  const defaultModel = provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;
  let isValid = false;
  let apiKey = '';

  while (!isValid) {
    apiKey = await password({
      message: `Paste your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key:`,
      mask: '*',
    });

    process.stdout.write('🔍 Validating key... ');
    if (provider === 'openai') {
      isValid = await validateOpenAI(apiKey);
    } else {
      isValid = await validateAnthropic(apiKey);
    }

    if (isValid) {
      console.log('Success!');
    } else {
      console.log('Invalid Key. Please try again.');
    }
  }

  config.providers = {
    ...(config.providers ?? {}),
    [provider]: {
      ...(existingProvider ?? {}),
      apiKey,
      model: existingProvider?.model || defaultModel,
    },
  };

  if (!config.defaults?.provider) {
    config.defaults = { ...(config.defaults ?? {}), provider };
  }

  await saveConfig(config);
  console.log(`Saved configuration to ${getConfigPath()}\n`);
}
