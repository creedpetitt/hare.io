import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';
import { runOnboarding } from '@cli/onboard.js';

export async function handleOnboardCommand(args: ParsedArgs): Promise<CommandResult> {
  const skipGateway = args.commandArgs.includes('--skip-gateway');
  const skipHealth = args.commandArgs.includes('--skip-health');
  const nonInteractive = args.commandArgs.includes('--non-interactive');
  await runOnboarding({ skipGateway, skipHealth, nonInteractive });
  return { handled: true, exitCode: 0 };
}
