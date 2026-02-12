import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  loadConfig,
  type AppConfig,
} from '../../core/config.js';
import {
  clearSessionModelOverride,
  getSessionCommandState,
  setSessionModelOverride,
} from '../commandState.js';
import { MODEL_CATALOG, resolveModelSpecifier } from './catalog.js';
import type { ActiveModel, CommandContext } from './types.js';

function firstConfiguredProvider(config: AppConfig): ActiveModel | null {
  if (config.providers?.openai?.apiKey) {
    return {
      provider: 'openai',
      model: config.providers.openai.model || DEFAULT_OPENAI_MODEL,
      isSessionOverride: false,
    };
  }
  if (config.providers?.anthropic?.apiKey) {
    return {
      provider: 'anthropic',
      model: config.providers.anthropic.model || DEFAULT_ANTHROPIC_MODEL,
      isSessionOverride: false,
    };
  }
  if (config.providers?.gemini?.apiKey) {
    return {
      provider: 'gemini',
      model: config.providers.gemini.model || DEFAULT_GEMINI_MODEL,
      isSessionOverride: false,
    };
  }
  return null;
}

export function resolveActiveModel(
  config: AppConfig,
  context: CommandContext
): ActiveModel | null {
  const state = getSessionCommandState(context.agentId, context.sessionId);
  if (state.providerOverride && state.modelOverride) {
    return {
      provider: state.providerOverride,
      model: state.modelOverride,
      isSessionOverride: true,
    };
  }

  const provider = config.defaults?.provider;
  if (provider) {
    const model =
      config.providers?.[provider]?.model ||
      (provider === 'openai'
        ? DEFAULT_OPENAI_MODEL
        : provider === 'anthropic'
          ? DEFAULT_ANTHROPIC_MODEL
          : DEFAULT_GEMINI_MODEL);
    return { provider, model, isSessionOverride: false };
  }

  return firstConfiguredProvider(config);
}

export async function runModelCommand(context: CommandContext, rawArgs: string): Promise<string> {
  const config = await loadConfig();
  const arg = rawArgs.trim();
  if (!arg) {
    const active = resolveActiveModel(config, context);
    if (!active) {
      return 'No model configured yet. Run `hare setup` first.';
    }
    return `Current model: ${active.provider}/${active.model}${
      active.isSessionOverride ? ' (session override)' : ''
    }`;
  }

  const lower = arg.toLowerCase();
  if (lower === 'clear' || lower === 'reset' || lower === 'off') {
    clearSessionModelOverride(context.agentId, context.sessionId);
    const active = resolveActiveModel(config, context);
    if (!active) {
      return 'Session model override cleared. No default model configured.';
    }
    return `Session model override cleared. Active model: ${active.provider}/${active.model}`;
  }

  if (lower === 'list') {
    return runModelsCommand(context);
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

  setSessionModelOverride(context.agentId, context.sessionId, resolved.provider, resolved.model);
  return `Session model set to ${resolved.provider}/${resolved.model} for ${context.agentId}:${context.sessionId}`;
}

export async function runModelsCommand(context: CommandContext): Promise<string> {
  const config = await loadConfig();
  const active = resolveActiveModel(config, context);
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
    lines.push(
      `Current: ${active.provider}/${active.model}${active.isSessionOverride ? ' (session override)' : ''}`
    );
  } else {
    lines.push('Current: unconfigured');
  }
  lines.push('Usage: /model <index|alias|provider/model>');
  lines.push('Use /model clear to remove the session override.');
  return lines.join('\n');
}
