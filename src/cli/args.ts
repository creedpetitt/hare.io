export type ParsedArgs = {
  agentId: string;
  profile?: string;
  command: string;
  commandArgs: string[];
};

const VALUE_FLAGS: Record<string, keyof Pick<ParsedArgs, 'agentId' | 'profile'>> = {
  '--agent': 'agentId',
  '-a': 'agentId',
  '--profile': 'profile',
  '-p': 'profile',
};

export function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);

  let agentId = 'main';
  let profile: string | undefined = undefined;

  let i = 0;

  while (i < argv.length) {
    const token = argv[i];

    if (token === '--') {
      i++;
      break;
    }

    if (token in VALUE_FLAGS) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        break;
      }
      const key = VALUE_FLAGS[token];
      if (key === 'agentId') agentId = next;
      else if (key === 'profile') profile = next;
      i += 2;
      continue;
    }

    break;
  }

  // everything remaining is command payload
  const remaining = argv.slice(i);
  const command = remaining[0] ?? '';
  const commandArgs = remaining.slice(1);

  return { agentId, profile, command, commandArgs };
}
