import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';
import { rotateGatewayToken } from '@cli/setup/index.js';

export async function handleTokenCommand(args: ParsedArgs): Promise<CommandResult> {
  if (args.commandArgs[0] === 'rotate') {
    await rotateGatewayToken();
    return { handled: true, exitCode: 0 };
  }
  return { handled: false };
}
