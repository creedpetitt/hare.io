import { loadConfig, DEFAULT_OPENAI_MODEL, DEFAULT_ANTHROPIC_MODEL } from '../config.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { LLMProvider } from './LLMProvider.js';

export type GetLLMOptions = {
  errorCode?: string;
  errorMessage?: string;
};

export async function getConfiguredLLM(
  options: GetLLMOptions = {}
): Promise<{ llm: LLMProvider; model: string }> {
  const config = await loadConfig();
  const preferred = config.defaults?.provider;
  if (preferred) {
    const preferredConfig = config.providers?.[preferred];
    if (preferredConfig?.apiKey) {
      const model =
        preferred === 'openai'
          ? preferredConfig.model || DEFAULT_OPENAI_MODEL
          : preferredConfig.model || DEFAULT_ANTHROPIC_MODEL;
      const llm =
        preferred === 'openai'
          ? new OpenAIProvider(preferredConfig.apiKey, model)
          : new AnthropicProvider(preferredConfig.apiKey, model);
      return { llm, model };
    }
  }

  const openaiConfig = config.providers?.openai;
  if (openaiConfig?.apiKey) {
    const model = openaiConfig.model || DEFAULT_OPENAI_MODEL;
    return { llm: new OpenAIProvider(openaiConfig.apiKey, model), model };
  }
  const anthropicConfig = config.providers?.anthropic;
  if (anthropicConfig?.apiKey) {
    const model = anthropicConfig.model || DEFAULT_ANTHROPIC_MODEL;
    return { llm: new AnthropicProvider(anthropicConfig.apiKey, model), model };
  }

  const error: any = new Error(options.errorMessage || 'No API Key found after auth check.');
  if (options.errorCode) error.code = options.errorCode;
  throw error;
}
