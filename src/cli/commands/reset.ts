import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import readline from 'readline';
import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.hareio');

export async function handleResetCommand(args: ParsedArgs): Promise<CommandResult> {
  const targetDir = path.join(CONFIG_DIR, 'agents', args.agentId);
  console.log(`  WARNING: This will delete all memory and sessions for agent '${args.agentId}'.`);
  console.log(`  Target: ${targetDir}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('Are you sure? (y/N) ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() === 'y') {
    try {
      await fs.rm(targetDir, { recursive: true, force: true });
      console.log(`Agent '${args.agentId}' memory wiped successfully.`);
    } catch (e) {
      console.error('Failed to reset agent:', e);
    }
  } else {
    console.log('Cancelled.');
  }

  return { handled: true, exitCode: 0 };
}
