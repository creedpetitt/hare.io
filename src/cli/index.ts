#!/usr/bin/env -S npx tsx
import readline from 'readline';
import { parseArgs } from '@cli/args.js';
import { ensureAuthenticated } from '@cli/setup/index.js';
import { runPrompt } from '@runtime/chat.js';
import { dispatch } from '@cli/commands/index.js';

async function main() {
  const args = parseArgs();

  // Try dispatch table first
  const result = await dispatch(args);
  if (result.handled) {
    if (!result.continueRunning) process.exit(result.exitCode ?? 0);
    return;
  }

  // Everything below requires auth
  await ensureAuthenticated();
  const gatewayUrl = process.env.HARE_GATEWAY_URL || 'ws://127.0.0.1:18789/ws';
  const gatewayToken = process.env.HARE_GATEWAY_TOKEN;

  // One-Shot Mode (if command exists and isn't a reserved word)
  if (args.command && args.command !== '') {
    const prompt = [args.command, ...args.commandArgs].join(' ');
    try {
      let streamed = false;
      const response = await runPrompt(prompt, {
        agentId: args.agentId,
        profile: args.profile,
        local: args.local,
        gatewayUrl,
        gatewayToken,
        onStream: (delta) => {
          streamed = true;
          process.stdout.write(delta);
        },
      });
      if (!streamed || !response) {
        console.log(response);
      } else {
        process.stdout.write('\n');
      }
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  }

  // Interactive Mode
  console.log(`🐰 Harebot CLI v0.0.0 [Agent: ${args.agentId}]`);
  console.log('-------------------');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question('> ', async (input) => {
      if (!input) return ask();
      if (input.toLowerCase() === '/exit') {
        console.log('Bye!');
        rl.close();
        process.exit(0);
      }

      try {
        let streamed = false;
        process.stdout.write('🐰 Thinking... ');
        const response = await runPrompt(input, {
          agentId: args.agentId,
          profile: args.profile,
          local: args.local,
          gatewayUrl,
          gatewayToken,
          onStream: (delta) => {
            if (!streamed) {
              streamed = true;
              readline.clearLine(process.stdout, 0);
              readline.cursorTo(process.stdout, 0);
            }
            process.stdout.write(delta);
          },
        });
        if (!streamed) {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          console.log(`\n${response}\n`);
        } else {
          process.stdout.write('\n\n');
        }
      } catch (error) {
        console.error('\nError:', error);
      }

      ask();
    });
  };

  ask();
}
main();
