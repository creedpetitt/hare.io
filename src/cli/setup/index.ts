import { confirm } from '@inquirer/prompts';
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  type ProviderId,
} from '@core/config.js';
import {
  validateProviderKey,
  validateBraveKey,
  validateTelegramKey,
  validateDiscordKey,
  type ProviderValidation,
} from '@cli/setup/validate.js';
import {
  generateGatewayToken,
  ensureGatewayToken,
  getProviderStatus,
  applyProviderKey,
  applyBraveKey,
  applyTelegramToken,
  applyDiscordToken,
  ensureDefaultProvider,
  resolveEnvKeys,
  selectNonInteractiveProvider,
} from '@cli/setup/config-writes.js';
import {
  promptProviderSelection,
  shouldReplaceProvider,
  promptForApiKey,
  promptForBraveKey,
  promptForTelegramToken,
  promptForDiscordToken,
} from '@cli/setup/prompts.js';

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

  const {
    openaiConfigured,
    anthropicConfigured,
    geminiConfigured,
    braveConfigured,
    telegramConfigured,
    discordConfigured,
  } = getProviderStatus(config);
  if (!force && (openaiConfigured || anthropicConfigured || geminiConfigured)) {
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
    const provider = await promptProviderSelection(
      openaiConfigured,
      anthropicConfigured,
      geminiConfigured
    );
    if (provider === 'cancel') {
      await saveConfig(config);
      console.log('Setup cancelled. No changes made.\n');
      return;
    }

    const replace = await shouldReplaceProvider(config, provider);
    if (replace) {
      const result = await promptForApiKey(provider);
      config = applyProviderKey(config, provider, result.apiKey, result.model, result.apiVersion);
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

  const { openaiKey, anthropicKey, geminiKey, braveKey, telegramToken, discordToken } =
    resolveEnvKeys(config);
  if (!openaiKey && !anthropicKey && !geminiKey) {
    throw new Error(
      'No provider API key found. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY, or run `hare setup`.'
    );
  }

  const providerToUse = selectNonInteractiveProvider(
    config.defaults?.provider,
    openaiKey,
    anthropicKey,
    geminiKey
  );
  const keyToValidate =
    providerToUse === 'openai' ? openaiKey : providerToUse === 'anthropic' ? anthropicKey : geminiKey;
  let validation: ProviderValidation | undefined;
  if (keyToValidate) {
    validation = await validateProviderKey(providerToUse, keyToValidate);
  }

  if (openaiKey) {
    config = applyProviderKey(config, 'openai', openaiKey);
  }
  if (anthropicKey) {
    config = applyProviderKey(config, 'anthropic', anthropicKey);
  }
  if (geminiKey) {
    config = applyProviderKey(
      config,
      'gemini',
      geminiKey,
      validation?.model,
      validation?.apiVersion
    );
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
