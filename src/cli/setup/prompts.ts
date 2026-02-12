import { confirm, password, select } from '@inquirer/prompts';
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

    process.stdout.write('🔍 Validating key... ');
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
      console.log('Success!');
    } else {
      console.log('Invalid Key. Please try again.');
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

export async function promptForTelegramToken(): Promise<string> {
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

export async function promptForDiscordToken(): Promise<string> {
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
