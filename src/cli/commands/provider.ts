import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';
import type { ProviderId } from '@core/config.js';
import { setDefaultProvider, setProviderModel, showCurrentProvider } from '@cli/setup/index.js';

const VALID_PROVIDERS = new Set<string>(['openai', 'anthropic', 'gemini']);

function isValidProvider(value: string | undefined): value is ProviderId {
  return value !== undefined && VALID_PROVIDERS.has(value);
}

export async function handleProviderCommand(args: ParsedArgs): Promise<CommandResult> {
  const sub = args.commandArgs[0];

  if (sub === 'use') {
    const provider = args.commandArgs[1];
    if (!isValidProvider(provider)) {
      console.log('Usage: hare provider use <openai|anthropic|gemini>');
      return { handled: true, exitCode: 1 };
    }
    await setDefaultProvider(provider);
    return { handled: true, exitCode: 0 };
  }

  if (sub === 'current') {
    await showCurrentProvider();
    return { handled: true, exitCode: 0 };
  }

  if (sub === 'model' && args.commandArgs[1] === 'set') {
    const provider = args.commandArgs[2];
    const model = args.commandArgs[3];
    if (!isValidProvider(provider) || !model) {
      console.log('Usage: hare provider model set <openai|anthropic|gemini> <model>');
      return { handled: true, exitCode: 1 };
    }
    await setProviderModel(provider, model);
    return { handled: true, exitCode: 0 };
  }

  return { handled: false };
}
