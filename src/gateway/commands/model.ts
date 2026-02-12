import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  loadConfig,
  saveConfig,
  type AppConfig,
} from '../../core/config.js';
import { MODEL_CATALOG, resolveModelSpecifier } from './catalog.js';
import type { ActiveModel } from './types.js';

function firstConfiguredProvider(config: AppConfig): ActiveModel | null {
  if (config.providers?.openai?.apiKey) {
    return {
      provider: 'openai',
      model: config.providers.openai.model || DEFAULT_OPENAI_MODEL,
    };
  }
  if (config.providers?.anthropic?.apiKey) {
    return {
      provider: 'anthropic',
      model: config.providers.anthropic.model || DEFAULT_ANTHROPIC_MODEL,
    };
  }
  if (config.providers?.gemini?.apiKey) {
    return {
      provider: 'gemini',
      model: config.providers.gemini.model || DEFAULT_GEMINI_MODEL,
    };
  }
  return null;
}

export function resolveActiveModel(config: AppConfig): ActiveModel | null {
  const provider = config.defaults?.provider;
  if (provider) {
    const model =
      config.providers?.[provider]?.model ||
      (provider === 'openai'
        ? DEFAULT_OPENAI_MODEL
        : provider === 'anthropic'
          ? DEFAULT_ANTHROPIC_MODEL
          : DEFAULT_GEMINI_MODEL);
    return { provider, model };
  }

  return firstConfiguredProvider(config);
}

export async function runModelCommand(rawArgs: string): Promise<string> {
  const config = await loadConfig();
  const arg = rawArgs.trim();
  if (!arg) {
    const active = resolveActiveModel(config);
    if (!active) {
      return 'No model configured yet. Run `hare setup` first.';
    }
    return `Current model: ${active.provider}/${active.model}`;
  }

  const lower = arg.toLowerCase();
  if (lower === 'clear' || lower === 'reset' || lower === 'off') {
    if (config.defaults?.provider) {
      delete config.defaults.provider;
    }
    await saveConfig(config);
    const active = resolveActiveModel(config);
    if (!active) {
      return 'Default provider cleared. No model configured.';
    }
    return `Default provider cleared. Active model: ${active.provider}/${active.model}`;
  }

  if (lower === 'list') {
    return runModelsCommand();
  }

  const resolved = resolveModelSpecifier(arg);
  if (!resolved) {
    return [
      `Unknown model selector: "${arg}".`,
      'Use `/models` to see valid values.',
      'You can also use `/model <provider/model>`.',
    ].join('\n');
  }

  const providerConfig = config.providers?.[resolved.provider];
  if (!providerConfig?.apiKey) {
    return `Provider "${resolved.provider}" is not configured yet. Run \`hare setup --section llm\`.`;
  }

  config.defaults = {
    ...config.defaults,
    provider: resolved.provider,
  };
  config.providers = config.providers || {};
  config.providers[resolved.provider] = {
    ...config.providers[resolved.provider],
    model: resolved.model,
  };
  await saveConfig(config);
  return `Default model set to ${resolved.provider}/${resolved.model} (persistent).`;
}

export async function runModelsCommand(): Promise<string> {
  const config = await loadConfig();
  const active = resolveActiveModel(config);
  const lines: string[] = ['Available models:'];

  const providers: Array<'openai' | 'anthropic'> = ['openai', 'anthropic'];
  let index = 1;
  for (const provider of providers) {
    lines.push('');
    lines.push(`${provider.toUpperCase()}:`);
    for (const entry of MODEL_CATALOG.filter((item) => item.provider === provider)) {
      const selected =
        active && active.provider === entry.provider && active.model === entry.model ? ' *' : '';
      const aliasHint = entry.aliases.length > 0 ? ` [${entry.aliases[0]}]` : '';
      lines.push(`  ${index}. ${entry.model}${aliasHint}${selected}`);
      index += 1;
    }
  }

  lines.push('');
  if (active) {
    lines.push(`Current: ${active.provider}/${active.model}`);
  } else {
    lines.push('Current: unconfigured');
  }
  lines.push('Usage: /model <index|alias|provider/model>');
  lines.push('Use /model clear to remove the default provider selection.');
  return lines.join('\n');
}
