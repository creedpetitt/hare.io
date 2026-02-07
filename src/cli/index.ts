#!/usr/bin/env -S npx tsx
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { parseArgs } from './args.js';
import {
  ensureAuthenticated,
  rotateGatewayToken,
  setDefaultProvider,
  setProviderModel,
  showCurrentProvider,
} from './setup.js';
import { runPrompt } from './run.js';
import { handleGatewayCommand } from './gateway.js';
import { runOnboarding } from './onboard.js';
import { type ProviderId } from '../core/config.js';

const CONFIG_DIR = path.join(os.homedir(), '.hareio');

async function main() {
  const { agentId, profile, local, command, commandArgs } = parseArgs();

  if (command === 'token' && commandArgs[0] === 'rotate') {
    await rotateGatewayToken();
    process.exit(0);
  }

  if (command === 'provider' && commandArgs[0] === 'use') {
    const provider = commandArgs[1] as ProviderId | undefined;
    if (!provider || (provider !== 'openai' && provider !== 'anthropic')) {
      console.log('Usage: hare provider use <openai|anthropic>');
      process.exit(1);
    }
    await setDefaultProvider(provider);
    process.exit(0);
  }

  if (command === 'provider' && commandArgs[0] === 'current') {
    await showCurrentProvider();
    process.exit(0);
  }

  if (command === 'provider' && commandArgs[0] === 'model' && commandArgs[1] === 'set') {
    const provider = commandArgs[2] as ProviderId | undefined;
    const model = commandArgs[3];
    if (!provider || (provider !== 'openai' && provider !== 'anthropic') || !model) {
      console.log('Usage: hare provider model set <openai|anthropic> <model>');
      process.exit(1);
    }
    await setProviderModel(provider, model);
    process.exit(0);
  }

  // Handle specialized commands that don't need the Agent
  if (command === 'setup' || command === 'config') {
    await ensureAuthenticated(true);
    process.exit(0);
  }

  if (command === 'onboard') {
    const skipGateway = commandArgs.includes('--skip-gateway');
    const skipHealth = commandArgs.includes('--skip-health');
    const nonInteractive = commandArgs.includes('--non-interactive');
    await runOnboarding({ skipGateway, skipHealth, nonInteractive });
    process.exit(0);
  }

  if (command === 'help') {
    console.log(`
🐰 Harebot CLI

Usage:
  hare                      Start interactive chat (default agent)
  hare <prompt>             Run a one-off task
  hare --agent <id>         Use a specific agent profile
  hare --profile <name>     Use a specific tool profile (minimal, coding, full)
  hare --local              Run the agent locally (bypass gateway)
  hare gateway <command>    Manage the gateway service
  hare onboard              Run quickstart onboarding
  hare setup                Configure AI providers
  hare token rotate         Rotate the gateway token
  hare provider use         Set the default provider
  hare provider current     Show the default provider
  hare provider model set   Set the default model for a provider
  hare reset                Wipe memory for current agent
  hare help                 Show this message
  
Examples:
  hare "Summarize this file"
  hare --agent work --profile coding "Draft an email"
  hare gateway install
  hare onboard
    `);
    process.exit(0);
  }

  // Handle Reset
  if (command === 'reset') {
    const targetDir = path.join(CONFIG_DIR, 'agents', agentId);
    console.log(`  WARNING: This will delete all memory and sessions for agent '${agentId}'.`);
    console.log(`  Target: ${targetDir}`);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question('Are you sure? (y/N) ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() === 'y') {
      try {
        await fs.rm(targetDir, { recursive: true, force: true });
        console.log(`Agent '${agentId}' memory wiped successfully.`);
      } catch (e) {
        console.error('Failed to reset agent:', e);
      }
    } else {
      console.log('Cancelled.');
    }
    process.exit(0);
  }

  if (command === 'gateway') {
    const shouldExit = await handleGatewayCommand(commandArgs);
    if (shouldExit) process.exit(0);
    return;
  }

  await ensureAuthenticated();
  const gatewayUrl = process.env.HARE_GATEWAY_URL || 'ws://127.0.0.1:18789/ws';
  const gatewayToken = process.env.HARE_GATEWAY_TOKEN;

  // One-Shot Mode (if command exists and isn't a reserved word)
  if (command && command !== '') {
    // Reconstruct the full prompt
    const prompt = [command, ...commandArgs].join(' ');
    try {
      const response = await runPrompt(prompt, {
        agentId,
        profile,
        local,
        gatewayUrl,
        gatewayToken,
      });
      console.log(response);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  }

  // Interactive Mode
  console.log(`🐰 Harebot CLI v0.0.0 [Agent: ${agentId}]`);
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
        process.stdout.write('🐰 Thinking... ');
        const response = await runPrompt(input, {
          agentId,
          profile,
          local,
          gatewayUrl,
          gatewayToken,
        });

        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        console.log(`\n${response}\n`);
      } catch (error) {
        console.error('\n❌ Error:', error);
      }

      ask();
    });
  };

  ask();
}
main();
