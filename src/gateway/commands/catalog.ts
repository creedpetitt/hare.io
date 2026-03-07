import type { ProviderId } from '../../core/config.js';

export type ModelCatalogEntry = {
  provider: ProviderId;
  model: string;
  aliases: string[];
  contextWindow: number;
};

export type ResolvedModel = {
  provider: ProviderId;
  model: string;
  source: 'index' | 'alias' | 'qualified';
  contextWindow?: number;
};

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  // OpenAI
  { provider: 'openai', model: 'gpt-4o', aliases: ['gpt4o', '4o'], contextWindow: 128_000 },
  { provider: 'openai', model: 'gpt-4o-mini', aliases: ['mini', '4o-mini'], contextWindow: 128_000 },
  { provider: 'openai', model: 'o1', aliases: ['o1'], contextWindow: 128_000 },
  { provider: 'openai', model: 'o1-mini', aliases: ['o1-mini'], contextWindow: 128_000 },
  { provider: 'openai', model: 'gpt-4-turbo', aliases: ['gpt4t'], contextWindow: 128_000 },
  
  // Anthropic
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', aliases: ['sonnet', '3.5-sonnet'], contextWindow: 200_000 },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', aliases: ['haiku', '3.5-haiku'], contextWindow: 200_000 },
  { provider: 'anthropic', model: 'claude-3-opus-20240229', aliases: ['opus'], contextWindow: 200_000 },
  
  // Gemini
  { provider: 'gemini', model: 'gemini-1.5-pro', aliases: ['gemini-pro', '1.5-pro'], contextWindow: 2_000_000 },
  { provider: 'gemini', model: 'gemini-1.5-flash', aliases: ['gemini-flash', '1.5-flash'], contextWindow: 1_000_000 },
  { provider: 'gemini', model: 'gemini-2.0-flash-exp', aliases: ['gemini-2', '2.0-flash'], contextWindow: 1_000_000 },
];

const VALID_PROVIDERS = new Set<ProviderId>(['openai', 'anthropic', 'gemini']);

export function resolveModelSpecifier(input: string): ResolvedModel | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed);
    if (index <= 0 || index > MODEL_CATALOG.length) return null;
    const selected = MODEL_CATALOG[index - 1];
    return { 
      provider: selected.provider, 
      model: selected.model, 
      source: 'index',
      contextWindow: selected.contextWindow 
    };
  }

  if (trimmed.includes('/')) {
    const slashIndex = trimmed.indexOf('/');
    const provider = trimmed.slice(0, slashIndex).trim().toLowerCase() as ProviderId;
    const model = trimmed.slice(slashIndex + 1).trim();
    if (!VALID_PROVIDERS.has(provider) || !model) return null;
    
    // Try to find context window from catalog even if qualified
    const entry = MODEL_CATALOG.find(e => e.provider === provider && e.model === model);
    return { provider, model, source: 'qualified', contextWindow: entry?.contextWindow };
  }

  const normalized = trimmed.toLowerCase();
  const byAlias = MODEL_CATALOG.find(
    (entry) =>
      entry.model.toLowerCase() === normalized ||
      entry.aliases.some((alias) => alias.toLowerCase() === normalized)
  );
  if (!byAlias) return null;
  return { 
    provider: byAlias.provider, 
    model: byAlias.model, 
    source: 'alias',
    contextWindow: byAlias.contextWindow 
  };
}
