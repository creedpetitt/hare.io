import { runHelpCommand } from './help.js';
import { runStatusCommand } from './status.js';
import { runSkillsCommand } from './skills.js';
import { runModelsCommand, runModelCommand } from './model.js';
import type { CommandContext, ParsedGatewayCommand } from './types.js';

export async function dispatchGatewayCommand(
  command: ParsedGatewayCommand,
  context: CommandContext
): Promise<string> {
  if (command.name === 'help' || command.name === 'commands') {
    return runHelpCommand();
  }
  if (command.name === 'status') {
    return runStatusCommand(context);
  }
  if (command.name === 'skills') {
    return runSkillsCommand(context.agentId);
  }
  if (command.name === 'skill') {
    return 'Usage: /skill <name> [input]\nRuns a normal agent turn with the named skill forced active.';
  }
  if (command.name === 'models') {
    return runModelsCommand();
  }
  if (command.name === 'model') {
    return runModelCommand(command.rawArgs);
  }

  return `Unknown slash command: /${command.name}\nTry /help`;
}
