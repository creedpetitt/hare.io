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
import { WebSearchTool } from '../tools/web_search.js';
import { runTelegramCommand } from './telegram.js';
import { runDiscordCommand } from './discord.js';

const CONFIG_DIR = path.join(os.homedir(), '.hareio');

async function main() {
  const { agentId, profile, local, command, commandArgs, section } = parseArgs();

  if (command === 'token' && commandArgs[0] === 'rotate') {
    await rotateGatewayToken();
    process.exit(0);
  }

  if (command === 'provider' && commandArgs[0] === 'use') {
    const provider = commandArgs[1] as ProviderId | undefined;
    if (!provider || (provider !== 'openai' && provider !== 'anthropic' && provider !== 'gemini')) {
      console.log('Usage: hare provider use <openai|anthropic|gemini>');
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
    if (
      !provider ||
      (provider !== 'openai' && provider !== 'anthropic' && provider !== 'gemini') ||
      !model
    ) {
      console.log('Usage: hare provider model set <openai|anthropic|gemini> <model>');
      process.exit(1);
    }
    await setProviderModel(provider, model);
    process.exit(0);
  }

  if (command === 'telegram') {
    const shouldExit = await runTelegramCommand(commandArgs, { local });
    if (shouldExit) process.exit(0);
    return;
  }

  if (command === 'discord') {
    const shouldExit = await runDiscordCommand(commandArgs, { local });
    if (shouldExit) process.exit(0);
    return;
  }

  if (command === 'web-search' || command === 'web_search') {
    const parsed = parseWebSearchArgs(commandArgs);
    if (!parsed.query) {
      console.log('Usage: hare web-search "<query>" [--max-results N] [--country US] [--lang en]');
      process.exit(1);
    }
    const tool = new WebSearchTool();
    let validated;
    try {
      validated = tool.schema.parse(parsed);
    } catch {
      console.log('Usage: hare web-search "<query>" [--max-results N] [--country US] [--lang en]');
      process.exit(1);
    }
    const result = await tool.execute(validated);
    console.log(result.result);
    process.exit(0);
  }

  // Handle specialized commands that don't need the Agent
  if (command === 'setup' || command === 'config') {
    await ensureAuthenticated(true, section);
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
  hare setup --section web  Configure web tool providers
  hare setup --section llm  Configure AI providers only
  hare setup --section telegram Configure Telegram bot token
  hare setup --section discord Configure Discord bot token
  hare token rotate         Rotate the gateway token
  hare provider use         Set the default provider
  hare provider current     Show the default provider
  hare provider model set   Set the default model for a provider
  hare web-search           Run web search without the LLM
  hare telegram             Run Telegram channel commands
  hare discord              Run Discord channel commands
  hare reset                Wipe memory for current agent
  hare help                 Show this message
  
Examples:
  hare "Summarize this file"
  hare --agent work --profile coding "Draft an email"
  hare gateway install
  hare gateway foreground
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
      let streamed = false;
      const response = await runPrompt(prompt, {
        agentId,
        profile,
        local,
        gatewayUrl,
        gatewayToken,
        onStream: local
          ? undefined
          : (delta) => {
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
        let streamed = false;
        process.stdout.write('🐰 Thinking... ');
        const response = await runPrompt(input, {
          agentId,
          profile,
          local,
          gatewayUrl,
          gatewayToken,
          onStream: local
            ? undefined
            : (delta) => {
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

function parseWebSearchArgs(args: string[]) {
  const input: { query?: string; maxResults?: number; country?: string; searchLang?: string } = {};
  const remaining: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--max-results' && args[i + 1]) {
      input.maxResults = Number(args[i + 1]);
      i++;
      continue;
    }
    if (token === '--country' && args[i + 1]) {
      input.country = args[i + 1];
      i++;
      continue;
    }
    if ((token === '--lang' || token === '--search-lang') && args[i + 1]) {
      input.searchLang = args[i + 1];
      i++;
      continue;
    }
    remaining.push(token);
  }
  if (remaining.length > 0) {
    input.query = remaining.join(' ');
  }
  return input;
}
