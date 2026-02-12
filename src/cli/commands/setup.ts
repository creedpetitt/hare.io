import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';
import { ensureAuthenticated } from '@cli/setup/index.js';

export async function handleSetupCommand(args: ParsedArgs): Promise<CommandResult> {
  const parsed = parseSetupSectionArg(args.commandArgs);
  if (!parsed.ok) {
    console.log('Usage: hare setup [--section llm|web|telegram|discord]');
    return { handled: true, exitCode: 1 };
  }

  const section = parsed.section?.toLowerCase();
  await ensureAuthenticated(true, section);
  return { handled: true, exitCode: 0 };
}

function parseSetupSectionArg(args: string[]): { ok: true; section?: string } | { ok: false } {
  let section: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--section') continue;
    const next = args[i + 1];
    if (!next || next.startsWith('-')) {
      return { ok: false };
    }
    section = next;
    i++;
  }

  return { ok: true, section };
}
