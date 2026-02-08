export type ParsedArgs = {
  agentId: string;
  profile?: string;
  local: boolean;
  command: string;
  commandArgs: string[];
  section?: string;
};

export function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let agentId = 'main';
  let profile = undefined;
  let local = false;
  let section = undefined;
  let command = '';
  let commandArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' || args[i] === '-a') {
      if (args[i + 1]) {
        agentId = args[i + 1];
        args.splice(i, 2);
        i--;
      }
    } else if (args[i] === '--local') {
      local = true;
      args.splice(i, 1);
      i--;
    } else if (args[i] === '--profile' || args[i] === '-p') {
      if (args[i + 1]) {
        profile = args[i + 1];
        args.splice(i, 2);
        i--;
      }
    } else if (args[i] === '--section') {
      if (args[i + 1]) {
        section = args[i + 1];
        args.splice(i, 2);
        i--;
      }
    }
  }

  if (args.length > 0) {
    command = args[0];
    commandArgs = args.slice(1);
  }

  return { agentId, profile, local, command, commandArgs, section };
}
