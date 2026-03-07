import { confirm, password, select, input } from '@inquirer/prompts';
import pc from 'picocolors';
import { type AppConfig, type ProviderId } from '@core/config.js';
import {
  validateOpenAI,
  validateAnthropic,
  validateGemini,
  validateBraveSearch,
  validateTelegramToken,
  validateDiscordToken,
} from '@cli/setup/validate.js';

export async function promptProviderSelection(
  openaiConfigured: boolean,
  anthropicConfigured: boolean,
  geminiConfigured: boolean
) {
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
        name: 'Gemini',
        value: 'gemini',
        description: geminiConfigured ? 'Configured' : 'Not configured',
      },
      {
        name: 'Cancel',
        value: 'cancel',
        description: 'Exit setup without changes',
      },
    ],
  })) as ProviderId | 'cancel';
}

export async function shouldReplaceProvider(
  config: AppConfig,
  provider: ProviderId
): Promise<boolean> {
  const configured = Boolean(config.providers?.[provider]?.apiKey);
  if (!configured) return true;

  return await confirm({
    message: `${provider} is already configured. Replace the API key?`,
    default: false,
  });
}

export async function promptForApiKey(provider: ProviderId): Promise<{
  apiKey: string;
  model?: string;
  apiVersion?: string;
}> {
  let isValid = false;
  let apiKey = '';
  let model: string | undefined;
  let apiVersion: string | undefined;

  while (!isValid) {
    apiKey = await password({
      message: `Paste your ${
        provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Gemini'
      } API Key:`,
      mask: '*',
    });

    process.stdout.write('  Validating key... ');
    const validation =
      provider === 'openai'
        ? await validateOpenAI(apiKey)
        : provider === 'anthropic'
          ? await validateAnthropic(apiKey)
          : await validateGemini(apiKey);
    isValid = validation.ok;
    model = validation.model;
    apiVersion = validation.apiVersion;

    if (isValid) {
      console.log(pc.green('Success!'));
    } else {
      console.log(pc.red('Invalid Key. Please try again.'));
    }
  }

  return { apiKey, model, apiVersion };
}

export async function promptForBraveKey(): Promise<string> {
  let isValid = false;
  let apiKey = '';

  while (!isValid) {
    apiKey = await password({
      message: 'Paste your Brave Search API Key:',
      mask: '*',
    });

    process.stdout.write('  Validating key... ');
    isValid = await validateBraveSearch(apiKey);

    if (isValid) {
      console.log(pc.green('Success!'));
    } else {
      console.log(pc.red('Invalid Key. Please try again.'));
    }
  }

  return apiKey;
}

export async function promptForTelegramToken(): Promise<string> {
  console.log(`\n  ${pc.bold(pc.cyan('Telegram Bot Setup Guide'))}`);
  console.log(`  ${pc.dim('1. Search for')} ${pc.yellow('@BotFather')} ${pc.dim('on Telegram.')}`);
  console.log(`  ${pc.dim('2. Send')} ${pc.bold('/newbot')} ${pc.dim('and follow the naming steps.')}`);
  console.log(`  ${pc.dim('3. Copy the')} ${pc.bold('HTTP API token')} ${pc.dim('provided.')}\n`);

  let isValid = false;
  let token = '';

  while (!isValid) {
    token = await password({
      message: 'Paste your Telegram Bot Token:',
      mask: '*',
    });

    process.stdout.write('  Validating token... ');
    isValid = await validateTelegramToken(token);

    if (isValid) {
      console.log(pc.green('Success!'));
    } else {
      console.log(pc.red('Invalid token. Please try again.'));
    }
  }

  return token;
}

export async function promptForDiscordToken(): Promise<string> {
  console.log(`\n  ${pc.bold(pc.cyan('Discord Bot Setup Guide'))}`);
  console.log(`  ${pc.dim('1. Go to:')} ${pc.blue('https://discord.com/developers/applications')}`);
  console.log(`  ${pc.dim('2. Create a')} ${pc.bold('New Application')} ${pc.dim('and navigate to the')} ${pc.bold('Bot')} ${pc.dim('tab.')}`);
  console.log(`  ${pc.dim('3. Reset/Copy the')} ${pc.bold('Bot Token')}${pc.dim('.')}`);
  console.log(`  ${pc.dim('4. ')}${pc.red(pc.bold('IMPORTANT:'))} ${pc.dim('Enable')} ${pc.yellow('Message Content Intent')} ${pc.dim('under Gateway Intents.')}`);
  console.log(`  ${pc.dim('5. Use the')} ${pc.bold('URL Generator')} ${pc.dim('(OAuth2) to invite the bot with')} ${pc.bold('Administrator')} ${pc.dim('perms.')}\n`);

  let isValid = false;
  let token = '';

  while (!isValid) {
    token = await password({
      message: 'Paste your Discord Bot Token:',
      mask: '*',
    });

    process.stdout.write('  Validating token... ');
    isValid = await validateDiscordToken(token);

    if (isValid) {
      console.log(pc.green('Success!'));
    } else {
      console.log(pc.red('Invalid token. Please try again.'));
    }
  }

  return token;
}

export async function promptForGatewayPort(current?: number): Promise<number> {
  const answer = await input({
    message: 'Which port should the Gateway run on?',
    default: (current || 18789).toString(),
    validate: (val) => {
      const p = parseInt(val, 10);
      if (isNaN(p) || p < 1024 || p > 65535) return 'Enter a valid port between 1024 and 65535';
      return true;
    },
  });
  return parseInt(answer, 10);
}
