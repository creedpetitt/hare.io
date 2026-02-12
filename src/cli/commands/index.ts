import type { ParsedArgs } from '@cli/args.js';
import { handleTokenCommand } from '@cli/commands/token.js';
import { handleProviderCommand } from '@cli/commands/provider.js';
import { handleSetupCommand } from '@cli/commands/setup.js';
import { handleGatewayCommand } from '@cli/commands/gateway.js';
import { handleChannelCommand } from '@cli/commands/channels.js';
import { handleWebSearchCommand } from '@cli/commands/web-search.js';
import { handleResetCommand } from '@cli/commands/reset.js';
import { handleHelpCommand } from '@cli/commands/help.js';
import { handleOnboardCommand } from '@cli/commands/onboard.js';
import { handleTuiCommand } from '@cli/commands/tui.js';

export type CommandResult = {
  handled: boolean;
  exitCode?: number;
  continueRunning?: boolean;
};

type CommandHandler = (args: ParsedArgs) => Promise<CommandResult>;

const COMMAND_TABLE: Record<string, CommandHandler> = {
  token: handleTokenCommand,
  provider: handleProviderCommand,
  setup: handleSetupCommand,
  config: handleSetupCommand,
  gateway: handleGatewayCommand,
  telegram: handleChannelCommand,
  discord: handleChannelCommand,
  'web-search': handleWebSearchCommand,
  web_search: handleWebSearchCommand,
  onboard: handleOnboardCommand,
  tui: handleTuiCommand,
  reset: handleResetCommand,
  help: handleHelpCommand,
};

export async function dispatch(args: ParsedArgs): Promise<CommandResult> {
  const handler = COMMAND_TABLE[args.command];
  if (!handler) return { handled: false };
  return handler(args);
}
