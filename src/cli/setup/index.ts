import { confirm, select } from '@inquirer/prompts';
import pc from 'picocolors';
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
  promptForGatewayPort,
} from '@cli/setup/prompts.js';

export async function rotateGatewayToken(): Promise<void> {
  let config = await loadConfig();
  config = gatewayTokenObject(config, generateGatewayToken());
  await saveConfig(config);
  console.log(`Gateway token rotated. Update clients using ${getConfigPath()}\n`);
}

function gatewayTokenObject(config: any, token: string) {
  return {
    ...config,
    gateway: { ...(config.gateway ?? {}), token },
  };
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

  console.log(`\n🐰 ${pc.bold('Welcome to Harebot!')} Let's get you set up.\n`);

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
  console.log(`Saved configuration to ${pc.dim(getConfigPath())}\n`);
}

export async function runFullWizard(): Promise<void> {
  let config = await loadConfig();
  config = ensureGatewayToken(config);

  process.stdout.write('\x1Bc'); // Clear terminal for clean start
  console.log(`\n  🐰 ${pc.magenta(pc.bold('Harebot Onboarding'))}`);
  console.log(`  ${pc.dim('──────────────────────────────────────────')}\n`);

  let currentStep = 1;

  while (currentStep <= 4) {
    process.stdout.write('\x1Bc'); // Clear for each dashboard refresh
    console.log(`\n  🐰 ${pc.magenta(pc.bold('Harebot Onboarding'))}`);
    console.log(`  ${pc.dim('──────────────────────────────────────────')}\n`);

    if (currentStep === 1) {
      console.log(`  ${pc.bold(pc.white('Step 1:'))} Configure AI Providers\n`);
      
      const openaiSet = Boolean(config.providers?.openai?.apiKey);
      const anthropicSet = Boolean(config.providers?.anthropic?.apiKey);
      const geminiSet = Boolean(config.providers?.gemini?.apiKey);

      // Determine default cursor position
      let defaultVal: string = 'continue';
      if (!openaiSet) defaultVal = 'openai';
      else if (!anthropicSet) defaultVal = 'anthropic';
      else if (!geminiSet) defaultVal = 'gemini';

      const providerAction = await select({
        message: pc.dim('Select a provider to configure:'),
        default: defaultVal,
        choices: [
          { 
            name: openaiSet ? `${pc.green('●')} OpenAI ${pc.dim('(Configured)')}` : `${pc.dim('○')} OpenAI`, 
            value: 'openai' 
          },
          { 
            name: anthropicSet ? `${pc.green('●')} Anthropic ${pc.dim('(Configured)')}` : `${pc.dim('○')} Anthropic`, 
            value: 'anthropic' 
          },
          { 
            name: geminiSet ? `${pc.green('●')} Gemini ${pc.dim('(Configured)')}` : `${pc.dim('○')} Gemini`, 
            value: 'gemini' 
          },
          { name: pc.magenta('→ Continue to Search Setup'), value: 'continue' },
        ],
      });

      if (providerAction === 'continue') {
        if (!openaiSet && !anthropicSet && !geminiSet) {
          console.log(`\n  ${pc.yellow('⚠  At least one AI provider is required.')}\n`);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        currentStep = 2;
        continue;
      }

      const p = providerAction as ProviderId;
      if (Boolean(config.providers?.[p]?.apiKey)) {
        const update = await confirm({
          message: `${pc.bold(p)} is already configured. Update the API key?`,
          default: false
        });
        if (!update) continue;
      }

      const result = await promptForApiKey(p);
      config = applyProviderKey(config, p, result.apiKey, result.model, result.apiVersion);
      config = ensureDefaultProvider(config, p);
      continue;
    }

    if (currentStep === 2) {
      console.log(`  ${pc.bold(pc.white('Step 2:'))} Web Research Capability\n`);

      const braveSet = Boolean(config.tools?.web?.search?.apiKey);
      const searchAction = await select({
        message: pc.dim('Enable Brave Search for live web data?'),
        default: braveSet ? 'continue' : 'config',
        choices: [
          { 
            name: braveSet ? `${pc.green('●')} Brave Search ${pc.dim('(Configured)')}` : `${pc.dim('○')} Configure Brave Search`, 
            value: 'config' 
          },
          { name: pc.magenta('→ Continue to Channels'), value: 'continue' },
          { name: pc.dim('← Back to AI Providers'), value: 'back' },
        ],
      });

      if (searchAction === 'back') {
        currentStep = 1;
        continue;
      }
      if (searchAction === 'continue') {
        currentStep = 3;
        continue;
      }

      if (braveSet) {
        const update = await confirm({
          message: 'Brave Search is already configured. Update the API key?',
          default: false
        });
        if (!update) continue;
      }

      const braveKey = await promptForBraveKey();
      config = applyBraveKey(config, braveKey);
      continue;
    }

    if (currentStep === 3) {
      console.log(`  ${pc.bold(pc.white('Step 3:'))} Messaging Channels ${pc.dim('(Optional)')}\n`);

      const telegramSet = Boolean(config.channels?.telegram?.botToken);
      const discordSet = Boolean(config.channels?.discord?.botToken);

      // Determine default cursor position
      let defaultVal: string = 'continue';
      if (!telegramSet) defaultVal = 'telegram';
      else if (!discordSet) defaultVal = 'discord';

      const channelAction = await select({
        message: pc.dim('Connect Harebot to your DMs:'),
        default: defaultVal,
        choices: [
          { 
            name: telegramSet ? `${pc.green('●')} Telegram ${pc.dim('(Configured)')}` : `${pc.dim('○')} Telegram`, 
            value: 'telegram' 
          },
          { 
            name: discordSet ? `${pc.green('●')} Discord ${pc.dim('(Configured)')}` : `${pc.dim('○')} Discord`, 
            value: 'discord' 
          },
          { name: pc.magenta('→ Continue to Port Configuration'), value: 'continue' },
          { name: pc.dim('← Back to Search Setup'), value: 'back' },
        ],
      });

      if (channelAction === 'back') {
        currentStep = 2;
        continue;
      }
      if (channelAction === 'continue') {
        currentStep = 4;
        continue;
      }

      const chan = channelAction as 'telegram' | 'discord';
      const isSet = chan === 'telegram' ? telegramSet : discordSet;
      if (isSet) {
        const update = await confirm({
          message: `${pc.bold(chan)} channel is already configured. Update the token?`,
          default: false
        });
        if (!update) continue;
      }

      if (channelAction === 'telegram') {
        const token = await promptForTelegramToken();
        config = applyTelegramToken(config, token);
      } else if (channelAction === 'discord') {
        const token = await promptForDiscordToken();
        config = applyDiscordToken(config, token);
      }
      continue;
    }

    if (currentStep === 4) {
      console.log(`  ${pc.bold(pc.white('Step 4:'))} Network Configuration\n`);

      const portAction = await select({
        message: pc.dim('Configure Gateway WebSocket port:'),
        choices: [
          { name: `  Standard Port ${pc.dim('(' + (config.gateway?.port || 18789) + ')')}`, value: 'standard' },
          { name: '  Custom Port', value: 'custom' },
          { name: pc.dim('← Back to Channels'), value: 'back' },
        ],
      });

      if (portAction === 'back') {
        currentStep = 3;
        continue;
      }

      if (portAction === 'custom') {
        const port = await promptForGatewayPort(config.gateway?.port);
        config.gateway = { ...config.gateway, port };
      }
      currentStep = 5; // Exit loop
    }
  }

  await saveConfig(config);
  console.log(`\n  ${pc.magenta(pc.bold('Finalizing Setup...'))}`);
  console.log(`  ${pc.dim('──────────────────────────────────────────')}`);
  console.log(`  ${pc.green('✓')} Configuration written to ${pc.dim(getConfigPath())}\n`);
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
    const { validateProviderKey: vpk } = await import('@cli/setup/validate.js');
    validation = await vpk(providerToUse, keyToValidate);
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
    const { validateBraveKey: vbk } = await import('@cli/setup/validate.js');
    await vbk(braveKey);
    config = applyBraveKey(config, braveKey);
  }

  if (telegramToken) {
    const { validateTelegramKey: vtk } = await import('@cli/setup/validate.js');
    await vtk(telegramToken);
    config = applyTelegramToken(config, telegramToken);
  }

  if (discordToken) {
    const { validateDiscordKey: vdk } = await import('@cli/setup/validate.js');
    await vdk(discordToken);
    config = applyDiscordToken(config, discordToken);
  }

  config = ensureDefaultProvider(config, providerToUse);

  await saveConfig(config);
}
