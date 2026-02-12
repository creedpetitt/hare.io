import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';
import { handleGatewayCommand as gatewayHandler } from '@cli/gateway/index.js';

export async function handleGatewayCommand(args: ParsedArgs): Promise<CommandResult> {
  const shouldExit = await gatewayHandler(args.commandArgs);
  if (shouldExit) {
    return { handled: true, exitCode: 0 };
  }
  return { handled: true, continueRunning: true };
}
