import {
  loadConfig,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  type ProviderId,
} from '../config.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { LLMProvider } from './LLMProvider.js';

export type GetLLMOptions = {
  errorCode?: string;
  errorMessage?: string;
  providerId?: ProviderId;
  model?: string;
};

function defaultModelForProvider(provider: ProviderId): string {
  if (provider === 'openai') return DEFAULT_OPENAI_MODEL;
  if (provider === 'anthropic') return DEFAULT_ANTHROPIC_MODEL;
  return DEFAULT_GEMINI_MODEL;
}

function buildProvider(provider: ProviderId, apiKey: string, model: string, apiVersion?: string): LLMProvider {
  if (provider === 'openai') return new OpenAIProvider(apiKey, model);
  if (provider === 'anthropic') return new AnthropicProvider(apiKey, model);
  return new GeminiProvider(apiKey, model, apiVersion);
}

export async function getConfiguredLLM(
  options: GetLLMOptions = {}
): Promise<{ llm: LLMProvider; model: string }> {
  const config = await loadConfig();

  // If a specific provider and model is requested via options
  if (options.providerId) {
    const providerConfig = config.providers?.[options.providerId];
    if (!providerConfig?.apiKey) {
      const error: any = new Error(`Requested provider "${options.providerId}" is missing an API key.`);
      error.code = options.errorCode || 'missing_api_key';
      throw error;
    }
    const model = options.model || providerConfig.model || defaultModelForProvider(options.providerId);
    const llm = buildProvider(options.providerId, providerConfig.apiKey, model, providerConfig.apiVersion);
    return { llm, model };
  }

  const preferred = config.defaults?.provider;
  if (preferred) {
    const preferredConfig = config.providers?.[preferred];
    if (!preferredConfig?.apiKey) {
      const error: any = new Error(`Preferred provider "${preferred}" is missing an API key.`);
      error.code = options.errorCode || 'missing_api_key';
      throw error;
    }
    const model = preferredConfig.model || defaultModelForProvider(preferred);
    const llm = buildProvider(preferred, preferredConfig.apiKey, model, preferredConfig.apiVersion);
    return { llm, model };
  }

  const openaiConfig = config.providers?.openai;
  if (openaiConfig?.apiKey) {
    const model = openaiConfig.model || defaultModelForProvider('openai');
    return { llm: buildProvider('openai', openaiConfig.apiKey, model), model };
  }
  const anthropicConfig = config.providers?.anthropic;
  if (anthropicConfig?.apiKey) {
    const model = anthropicConfig.model || defaultModelForProvider('anthropic');
    return { llm: buildProvider('anthropic', anthropicConfig.apiKey, model), model };
  }
  const geminiConfig = config.providers?.gemini;
  if (geminiConfig?.apiKey) {
    const model = geminiConfig.model || defaultModelForProvider('gemini');
    return { llm: buildProvider('gemini', geminiConfig.apiKey, model, geminiConfig.apiVersion), model };
  }

  const error: any = new Error(options.errorMessage || 'No API Key found after auth check.');
  if (options.errorCode) error.code = options.errorCode;
  throw error;
}
