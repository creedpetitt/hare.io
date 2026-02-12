import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';

export async function handleHelpCommand(_args: ParsedArgs): Promise<CommandResult> {
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
  hare tui                  Launch interactive TUI chat client (slash commands in gateway mode)
  hare web-search           Run web search without the LLM
  hare telegram             Run Telegram channel commands
  hare discord              Run Discord channel commands
  hare reset                Wipe memory for current agent
  hare help                 Show this message
  
Examples:
  hare "Summarize this file"
  hare --agent work --profile coding "Draft an email"
  hare tui
  hare tui --local
  hare tui --gateway --url ws://127.0.0.1:18789/ws
  hare gateway install
  hare gateway foreground
  hare onboard
    `);
  return { handled: true, exitCode: 0 };
}
