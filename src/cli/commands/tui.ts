import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';
import { ensureAuthenticated } from '@cli/setup/index.js';
import { startTui } from '@tui/index.js';

type TuiCommandOptions = {
  agentId: string;
  sessionId: string;
  profile?: string;
  local: boolean;
  gatewayUrl: string;
  gatewayToken?: string;
};

function parseTuiOptions(args: ParsedArgs): TuiCommandOptions {
  const tokens = args.commandArgs;
  let agentId = args.agentId;
  let sessionId = 'main';
  let profile = args.profile;
  let local = args.local;
  let gatewayUrl = process.env.HARE_GATEWAY_URL || 'ws://127.0.0.1:18789/ws';
  let gatewayToken = process.env.HARE_GATEWAY_TOKEN;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--local') {
      local = true;
      continue;
    }
    if (token === '--gateway') {
      local = false;
      continue;
    }
    if ((token === '--agent' || token === '-a') && tokens[i + 1]) {
      agentId = tokens[i + 1];
      i += 1;
      continue;
    }
    if ((token === '--session' || token === '-s') && tokens[i + 1]) {
      sessionId = tokens[i + 1];
      i += 1;
      continue;
    }
    if ((token === '--profile' || token === '-p') && tokens[i + 1]) {
      profile = tokens[i + 1];
      i += 1;
      continue;
    }
    if (token === '--url' && tokens[i + 1]) {
      gatewayUrl = tokens[i + 1];
      i += 1;
      continue;
    }
    if (token === '--token' && tokens[i + 1]) {
      gatewayToken = tokens[i + 1];
      i += 1;
      continue;
    }
  }

  return { agentId, sessionId, profile, local, gatewayUrl, gatewayToken };
}

export async function handleTuiCommand(args: ParsedArgs): Promise<CommandResult> {
  const options = parseTuiOptions(args);

  await ensureAuthenticated();
  const exitCode = await startTui(options);
  return { handled: true, exitCode };
}
