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

async function validateBraveSearch(apiKey: string): Promise<boolean> {
  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', 'hare');
    url.searchParams.set('count', '1');
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });
    if (!response.ok) return false;
    return true;
  } catch {
    return false;
  }
}

async function validateTelegramToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!response.ok) return false;
    const json = (await response.json()) as { ok?: boolean };
    return Boolean(json.ok);
  } catch {
    return false;
  }
}

async function validateDiscordToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
    });
    return response.ok;
  } catch {
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
    braveConfigured: Boolean(config.tools?.web?.search?.apiKey),
    telegramConfigured: Boolean(config.channels?.telegram?.botToken),
    discordConfigured: Boolean(config.channels?.discord?.botToken),
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

async function promptForBraveKey(): Promise<string> {
  let isValid = false;
  let apiKey = '';

  while (!isValid) {
    apiKey = await password({
      message: 'Paste your Brave Search API Key:',
      mask: '*',
    });

    process.stdout.write('🔍 Validating key... ');
    isValid = await validateBraveSearch(apiKey);

    if (isValid) {
      console.log('Success!');
    } else {
      console.log('Invalid Key. Please try again.');
    }
  }

  return apiKey;
}

async function promptForTelegramToken(): Promise<string> {
  let isValid = false;
  let token = '';

  while (!isValid) {
    token = await password({
      message: 'Paste your Telegram Bot Token:',
      mask: '*',
    });

    process.stdout.write('🔍 Validating token... ');
    isValid = await validateTelegramToken(token);

    if (isValid) {
      console.log('Success!');
    } else {
      console.log('Invalid token. Please try again.');
    }
  }

  return token;
}

async function promptForDiscordToken(): Promise<string> {
  let isValid = false;
  let token = '';

  while (!isValid) {
    token = await password({
      message: 'Paste your Discord Bot Token:',
      mask: '*',
    });

    process.stdout.write('🔍 Validating token... ');
    isValid = await validateDiscordToken(token);

    if (isValid) {
      console.log('Success!');
    } else {
      console.log('Invalid token. Please try again.');
    }
  }

  return token;
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

function applyBraveKey(config: AppConfig, apiKey: string): AppConfig {
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

function applyTelegramToken(config: AppConfig, token: string): AppConfig {
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

function applyDiscordToken(config: AppConfig, token: string): AppConfig {
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

function ensureDefaultProvider(config: AppConfig, provider: ProviderId): AppConfig {
  if (!config.defaults?.provider) {
    config.defaults = { ...(config.defaults ?? {}), provider };
  }
  return config;
}

function resolveEnvKeys(config: AppConfig) {
  const envOpenAI = process.env.OPENAI_API_KEY;
  const envAnthropic = process.env.ANTHROPIC_API_KEY;
  const envBrave = process.env.BRAVE_API_KEY;
  const envTelegram = process.env.TELEGRAM_BOT_TOKEN;
  const envDiscord = process.env.DISCORD_BOT_TOKEN;
  const openaiKey = config.providers?.openai?.apiKey || envOpenAI;
  const anthropicKey = config.providers?.anthropic?.apiKey || envAnthropic;
  const braveKey = config.tools?.web?.search?.apiKey || envBrave;
  const telegramToken = config.channels?.telegram?.botToken || envTelegram;
  const discordToken = config.channels?.discord?.botToken || envDiscord;
  return { openaiKey, anthropicKey, braveKey, telegramToken, discordToken };
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

async function validateBraveKey(apiKey: string): Promise<void> {
  const ok = await validateBraveSearch(apiKey);
  if (!ok) {
    throw new Error('Brave Search API key validation failed.');
  }
}

async function validateTelegramKey(token: string): Promise<void> {
  const ok = await validateTelegramToken(token);
  if (!ok) {
    throw new Error('Telegram bot token validation failed.');
  }
}

async function validateDiscordKey(token: string): Promise<void> {
  const ok = await validateDiscordToken(token);
  if (!ok) {
    throw new Error('Discord bot token validation failed.');
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

export async function ensureAuthenticated(force = false, section?: string) {
  let config = await loadConfig();
  config = ensureGatewayToken(config);

  const { openaiConfigured, anthropicConfigured, braveConfigured, telegramConfigured, discordConfigured } =
    getProviderStatus(config);
  if (!force && (openaiConfigured || anthropicConfigured)) {
    await saveConfig(config);
    return;
  }

  const normalizedSection = section?.toLowerCase();
  const doLlm = !normalizedSection || normalizedSection === 'llm';
  const doWeb = !normalizedSection || normalizedSection === 'web';
  const doTelegram = !normalizedSection || normalizedSection === 'telegram';
  const doDiscord = !normalizedSection || normalizedSection === 'discord';

  console.log("\n🐰 Welcome to Harebot! Let's get you set up.\n");

  if (doLlm) {
    const provider = await promptProviderSelection(openaiConfigured, anthropicConfigured);
    if (provider === 'cancel') {
      await saveConfig(config);
      console.log('Setup cancelled. No changes made.\n');
      return;
    }

    const shouldReplace = await shouldReplaceProvider(config, provider);
    if (shouldReplace) {
      const apiKey = await promptForApiKey(provider);
      config = applyProviderKey(config, provider, apiKey);
      config = ensureDefaultProvider(config, provider);
    } else {
      console.log('No provider changes made.\n');
    }
  }

  if (doWeb) {
    const configureBrave = await confirm({
      message: braveConfigured
        ? 'Brave Search is already configured. Replace the API key?'
        : 'Configure Brave Search API key?',
      default: false,
    });
    if (configureBrave) {
      const braveKey = await promptForBraveKey();
      config = applyBraveKey(config, braveKey);
    }
  }

  if (doTelegram) {
    const configureTelegram = await confirm({
      message: telegramConfigured
        ? 'Telegram is already configured. Replace the bot token?'
        : 'Configure Telegram bot token?',
      default: false,
    });
    if (configureTelegram) {
      const token = await promptForTelegramToken();
      config = applyTelegramToken(config, token);
    }
  }

  if (doDiscord) {
    const configureDiscord = await confirm({
      message: discordConfigured
        ? 'Discord is already configured. Replace the bot token?'
        : 'Configure Discord bot token?',
      default: false,
    });
    if (configureDiscord) {
      const token = await promptForDiscordToken();
      config = applyDiscordToken(config, token);
    }
  }

  await saveConfig(config);
  console.log(`Saved configuration to ${getConfigPath()}\n`);
}

export async function ensureAuthenticatedNonInteractive(): Promise<void> {
  let config = await loadConfig();
  config = ensureGatewayToken(config);

  const { openaiKey, anthropicKey, braveKey, telegramToken, discordToken } =
    resolveEnvKeys(config);
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

  if (braveKey) {
    await validateBraveKey(braveKey);
    config = applyBraveKey(config, braveKey);
  }

  if (telegramToken) {
    await validateTelegramKey(telegramToken);
    config = applyTelegramToken(config, telegramToken);
  }

  if (discordToken) {
    await validateDiscordKey(discordToken);
    config = applyDiscordToken(config, discordToken);
  }

  config = ensureDefaultProvider(config, providerToUse);

  await saveConfig(config);
}
