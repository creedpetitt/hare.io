import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';
import { runTelegramCommand } from '@cli/channels/telegram.js';
import { runDiscordCommand } from '@cli/channels/discord.js';

export async function handleChannelCommand(args: ParsedArgs): Promise<CommandResult> {
  const handler = args.command === 'telegram' ? runTelegramCommand : runDiscordCommand;
  const shouldExit = await handler(args.commandArgs);
  if (shouldExit) {
    return { handled: true, exitCode: 0 };
  }
  return { handled: true, continueRunning: true };
}
