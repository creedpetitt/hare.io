import { Message } from '@core/types.js';
import { OpenAIProvider } from '@core/llm/OpenAIProvider.js';
import { AnthropicProvider } from '@core/llm/AnthropicProvider.js';
import { GeminiProvider } from '@core/llm/GeminiProvider.js';
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  type ProviderId,
} from '@core/config.js';

export type ProviderValidation = {
  ok: boolean;
  model?: string;
  apiVersion?: string;
};

export async function validateOpenAI(apiKey: string): Promise<ProviderValidation> {
  try {
    const provider = new OpenAIProvider(apiKey, DEFAULT_OPENAI_MODEL);
    await provider.generate('Hello', []);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'OpenAI validation failed.';
    console.log(msg);
    return { ok: false };
  }
}

export async function validateAnthropic(apiKey: string): Promise<ProviderValidation> {
  try {
    const provider = new AnthropicProvider(apiKey, DEFAULT_ANTHROPIC_MODEL);
    const history: Message[] = [{ role: 'user', content: 'ping', timestamp: Date.now() }];
    await provider.generate('Hello', history);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Anthropic validation failed.';
    console.log(msg);
    return { ok: false };
  }
}

export async function listGeminiModels(apiKey: string, apiVersion: string) {
  const url = new URL(`https://generativelanguage.googleapis.com/${apiVersion}/models`);
  url.searchParams.set('key', apiKey);
  const response = await fetch(url.toString());
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Gemini list models failed (${response.status})`);
  }
  const data = (await response.json()) as {
    models?: Array<{
      name?: string;
      supportedGenerationMethods?: string[];
    }>;
  };
  return data.models ?? [];
}

export function pickGeminiModel(
  models: Array<{ name?: string; supportedGenerationMethods?: string[] }>
) {
  const candidates = models.filter((m) =>
    (m.supportedGenerationMethods ?? []).includes('generateContent')
  );
  const preferred = candidates.find((m) => m.name?.endsWith(`/${DEFAULT_GEMINI_MODEL}`));
  const selected = preferred || candidates[0];
  if (!selected?.name) return undefined;
  return selected.name.replace(/^models\//, '');
}

export async function validateGemini(apiKey: string): Promise<ProviderValidation> {
  try {
    const history: Message[] = [{ role: 'user', content: 'ping', timestamp: Date.now() }];
    let models;
    let apiVersion: string | undefined;
    try {
      models = await listGeminiModels(apiKey, 'v1');
      apiVersion = 'v1';
    } catch {
      models = await listGeminiModels(apiKey, 'v1beta');
      apiVersion = 'v1beta';
    }

    const model = pickGeminiModel(models);
    const validated = new GeminiProvider(apiKey, model || DEFAULT_GEMINI_MODEL, apiVersion);
    await validated.generate('Hello', history);
    return { ok: true, model: model || DEFAULT_GEMINI_MODEL, apiVersion };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Gemini validation failed.';
    console.log(msg);
    return { ok: false };
  }
}

export async function validateBraveSearch(apiKey: string): Promise<boolean> {
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

export async function validateTelegramToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!response.ok) return false;
    const json = (await response.json()) as { ok?: boolean };
    return Boolean(json.ok);
  } catch {
    return false;
  }
}

export async function validateDiscordToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function validateProviderKey(
  provider: ProviderId,
  apiKey: string
): Promise<ProviderValidation> {
  const validation =
    provider === 'openai'
      ? await validateOpenAI(apiKey)
      : provider === 'anthropic'
        ? await validateAnthropic(apiKey)
        : await validateGemini(apiKey);
  if (!validation.ok) {
    throw new Error(
      `${
        provider === 'openai'
          ? 'OpenAI'
          : provider === 'anthropic'
            ? 'Anthropic'
            : 'Gemini'
      } API key validation failed.`
    );
  }
  return validation;
}

export async function validateBraveKey(apiKey: string): Promise<void> {
  const ok = await validateBraveSearch(apiKey);
  if (!ok) {
    throw new Error('Brave Search API key validation failed.');
  }
}

export async function validateTelegramKey(token: string): Promise<void> {
  const ok = await validateTelegramToken(token);
  if (!ok) {
    throw new Error('Telegram bot token validation failed.');
  }
}

export async function validateDiscordKey(token: string): Promise<void> {
  const ok = await validateDiscordToken(token);
  if (!ok) {
    throw new Error('Discord bot token validation failed.');
  }
}
