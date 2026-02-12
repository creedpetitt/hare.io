import type { ParsedArgs } from '@cli/args.js';
import type { CommandResult } from '@cli/commands/index.js';
import { WebSearchTool } from '@tools/web_search.js';

export async function handleWebSearchCommand(args: ParsedArgs): Promise<CommandResult> {
  const parsed = parseWebSearchArgs(args.commandArgs);
  if (!parsed.query) {
    console.log('Usage: hare web-search "<query>" [--max-results N] [--country US] [--lang en]');
    return { handled: true, exitCode: 1 };
  }

  const tool = new WebSearchTool();
  let validated;
  try {
    validated = tool.schema.parse(parsed);
  } catch {
    console.log('Usage: hare web-search "<query>" [--max-results N] [--country US] [--lang en]');
    return { handled: true, exitCode: 1 };
  }

  const result = await tool.execute(validated);
  console.log(result.result);
  return { handled: true, exitCode: 0 };
}

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
