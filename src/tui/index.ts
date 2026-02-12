import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { runPrompt } from '@runtime/chat.js';
import { CONFIG_DIR, loadConfig } from '@core/config.js';

type TuiOptions = {
  agentId: string;
  sessionId: string;
  profile?: string;
  local: boolean;
  gatewayUrl: string;
  gatewayToken?: string;
};

type TuiState = TuiOptions & {
  runState: 'idle' | 'running' | 'error';
};

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
};

function color(text: string, tone: keyof typeof ANSI): string {
  return `${ANSI[tone]}${text}${ANSI.reset}`;
}

async function resolveConfiguredModelLabel(): Promise<string> {
  const config = await loadConfig();
  const provider = config.defaults?.provider;
  if (!provider) return 'unconfigured';
  const model = config.providers?.[provider]?.model;
  return `${provider}/${model || 'default'}`;
}

async function listSessionKeys(agentId: string): Promise<string[]> {
  const sessionsDir = path.join(CONFIG_DIR, 'agents', agentId, 'sessions');
  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.jsonl'))
    .filter((name) => !name.endsWith('.archive.jsonl'));

  const withMtime: Array<{ key: string; mtimeMs: number }> = [];
  for (const file of files) {
    const filePath = path.join(sessionsDir, file);
    try {
      const stat = await fs.stat(filePath);
      withMtime.push({ key: file.slice(0, -6), mtimeMs: stat.mtimeMs });
    } catch {
      withMtime.push({ key: file.slice(0, -6), mtimeMs: 0 });
    }
  }

  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withMtime.map((item) => item.key);
}

async function printHeader(state: TuiState): Promise<void> {
  const modelLabel = await resolveConfiguredModelLabel();
  console.log('');
  console.log(
    `${color('🐰 Hare TUI', 'magenta')} ${color('MVP', 'dim')} ${color('- local-first chat control surface', 'gray')}`
  );
  console.log(
    `${color('mode', 'gray')} ${state.local ? color('local', 'green') : color('gateway', 'green')} ${color('|', 'gray')} ${color(
      'url',
      'gray'
    )} ${state.gatewayUrl}`
  );
  console.log(
    `${color('agent', 'gray')} ${state.agentId} ${color('|', 'gray')} ${color('session', 'gray')} ${
      state.sessionId
    } ${color('|', 'gray')} ${color('profile', 'gray')} ${state.profile || 'default'}`
  );
  console.log(
    `${color('model', 'gray')} ${modelLabel} ${color('|', 'gray')} ${color('state', 'gray')} ${
      state.runState
    }`
  );
  console.log(color('─'.repeat(90), 'gray'));
  console.log(color('Tip: /help for TUI commands. Gateway slash commands: /status /skills /models /model ...', 'dim'));
  console.log('');
}

function printLocalHelp(): void {
  console.log(
    [
      'TUI commands:',
      '/help                Show this help',
      '/clear               Clear screen and reset visible log',
      '/exit                Exit TUI',
      '/agent <id>          Switch active agent id',
      '/session <key>       Switch active session key',
      '/resume [index|key]  Show recent sessions or switch to one',
      '',
      'Gateway-owned slash commands (gateway mode only):',
      '/status, /skills, /models, /model <...>',
    ].join('\n')
  );
}

function parseLocalCommand(input: string): { name: string; arg: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const body = trimmed.slice(1).trim();
  if (!body) return { name: 'help', arg: '' };
  const firstSpace = body.indexOf(' ');
  if (firstSpace === -1) return { name: body.toLowerCase(), arg: '' };
  return {
    name: body.slice(0, firstSpace).toLowerCase(),
    arg: body.slice(firstSpace + 1).trim(),
  };
}

async function handleLocalCommand(
  state: TuiState,
  input: string
): Promise<'handled' | 'exit' | 'forward'> {
  const parsed = parseLocalCommand(input);
  if (!parsed) return 'forward';

  if (parsed.name === 'help') {
    printLocalHelp();
    return 'handled';
  }
  if (parsed.name === 'exit' || parsed.name === 'quit') {
    return 'exit';
  }
  if (parsed.name === 'clear') {
    console.clear();
    await printHeader(state);
    return 'handled';
  }
  if (parsed.name === 'agent') {
    if (!parsed.arg) {
      console.log(`Current agent: ${state.agentId}`);
      return 'handled';
    }
    state.agentId = parsed.arg;
    console.log(`Agent set to ${state.agentId}`);
    return 'handled';
  }
  if (parsed.name === 'session') {
    if (!parsed.arg) {
      console.log(`Current session: ${state.sessionId}`);
      return 'handled';
    }
    state.sessionId = parsed.arg;
    console.log(`Session set to ${state.sessionId}`);
    return 'handled';
  }
  if (parsed.name === 'resume') {
    const sessions = await listSessionKeys(state.agentId);
    if (sessions.length === 0) {
      console.log(`No saved sessions found for agent "${state.agentId}".`);
      return 'handled';
    }
    if (!parsed.arg) {
      console.log('Recent sessions:');
      sessions.slice(0, 10).forEach((key, idx) => {
        const marker = key === state.sessionId ? ' *' : '';
        console.log(`  ${idx + 1}. ${key}${marker}`);
      });
      console.log('Use /resume <index|key> to switch.');
      return 'handled';
    }
    if (/^\d+$/.test(parsed.arg)) {
      const index = Number(parsed.arg);
      if (index <= 0 || index > sessions.length) {
        console.log('Invalid session index.');
        return 'handled';
      }
      state.sessionId = sessions[index - 1];
      console.log(`Session set to ${state.sessionId}`);
      return 'handled';
    }
    state.sessionId = parsed.arg;
    console.log(`Session set to ${state.sessionId}`);
    return 'handled';
  }

  return 'forward';
}

async function runTurn(state: TuiState, input: string): Promise<void> {
  if (state.local && input.trim().startsWith('/')) {
    console.log(
      color('Slash command routing is gateway-owned. Start TUI without --local to use /status /skills /models /model.', 'red')
    );
    return;
  }

  state.runState = 'running';
  let streamed = false;
  let streamBuffer = '';
  process.stdout.write(`${color('assistant>', 'cyan')} `);
  try {
    const response = await runPrompt(input, {
      agentId: state.agentId,
      sessionId: state.sessionId,
      profile: state.profile,
      local: state.local,
      gatewayUrl: state.gatewayUrl,
      gatewayToken: state.gatewayToken,
      onStream: (delta) => {
        streamed = true;
        streamBuffer += delta;
        process.stdout.write(delta);
      },
    });

    if (!streamed) {
      process.stdout.write(response || '');
    } else if (!streamBuffer.trim() && response) {
      process.stdout.write(response);
    }
    process.stdout.write('\n');
    state.runState = 'idle';
  } catch (error: any) {
    process.stdout.write('\n');
    console.log(color(`Error: ${error?.message || 'Unknown error'}`, 'red'));
    state.runState = 'error';
  }
}

export async function startTui(options: TuiOptions): Promise<number> {
  const state: TuiState = {
    ...options,
    runState: 'idle',
  };

  await printHeader(state);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return await new Promise<number>((resolve) => {
    const ask = () => {
      rl.question(`${color('you>', 'green')} `, async (input) => {
        const trimmed = input.trim();
        if (!trimmed) {
          ask();
          return;
        }

        const localOutcome = await handleLocalCommand(state, trimmed);
        if (localOutcome === 'exit') {
          console.log('Bye.');
          rl.close();
          resolve(0);
          return;
        }
        if (localOutcome === 'handled') {
          ask();
          return;
        }

        await runTurn(state, trimmed);
        ask();
      });
    };

    rl.on('SIGINT', () => {
      console.log('\nBye.');
      rl.close();
      resolve(0);
    });

    ask();
  });
}
