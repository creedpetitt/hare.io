import type { ProviderId } from '../../core/config.js';

export type ModelCatalogEntry = {
  provider: ProviderId;
  model: string;
  aliases: string[];
};

export type ResolvedModel = {
  provider: ProviderId;
  model: string;
  source: 'index' | 'alias' | 'qualified';
};

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  { provider: 'openai', model: 'gpt-5.2', aliases: ['gpt52'] },
  { provider: 'openai', model: 'gpt-5', aliases: ['gpt5'] },
  { provider: 'openai', model: 'gpt-5-mini', aliases: ['gpt5-mini', 'g5mini'] },
  { provider: 'openai', model: 'gpt-5-nano', aliases: ['gpt5-nano', 'g5nano'] },
  { provider: 'openai', model: 'gpt-5.2-codex', aliases: ['gpt52-codex', 'codex'] },
  { provider: 'anthropic', model: 'claude-opus-4-6', aliases: ['opus46'] },
  { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929', aliases: ['sonnet45'] },
  { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', aliases: ['haiku45'] },
  { provider: 'anthropic', model: 'claude-opus-4-1-20250805', aliases: ['opus41'] },
  { provider: 'anthropic', model: 'claude-sonnet-4-20250514', aliases: ['sonnet4'] },
  { provider: 'anthropic', model: 'claude-3-haiku-20240307', aliases: ['haiku3'] },
];

const VALID_PROVIDERS = new Set<ProviderId>(['openai', 'anthropic', 'gemini']);

export function resolveModelSpecifier(input: string): ResolvedModel | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed);
    if (index <= 0 || index > MODEL_CATALOG.length) return null;
    const selected = MODEL_CATALOG[index - 1];
    return { provider: selected.provider, model: selected.model, source: 'index' };
  }

  if (trimmed.includes('/')) {
    const slashIndex = trimmed.indexOf('/');
    const provider = trimmed.slice(0, slashIndex).trim().toLowerCase() as ProviderId;
    const model = trimmed.slice(slashIndex + 1).trim();
    if (!VALID_PROVIDERS.has(provider) || !model) return null;
    return { provider, model, source: 'qualified' };
  }

  const normalized = trimmed.toLowerCase();
  const byAlias = MODEL_CATALOG.find(
    (entry) =>
      entry.model.toLowerCase() === normalized ||
      entry.aliases.some((alias) => alias.toLowerCase() === normalized)
  );
  if (!byAlias) return null;
  return { provider: byAlias.provider, model: byAlias.model, source: 'alias' };
}
