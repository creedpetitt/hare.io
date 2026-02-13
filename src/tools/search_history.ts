import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import type { AgentContext, ToolResult } from '../core/types.js';

const SearchHistorySchema = z.object({
  query: z.string().min(1).describe('Text to find in memory/HISTORY.md.'),
  maxResults: z.number().int().positive().optional().describe('Maximum matching blocks to return.'),
  maxChars: z.number().int().positive().optional().describe('Maximum characters per returned block.'),
  caseSensitive: z.boolean().optional().describe('Whether match should be case-sensitive.'),
});

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_CHARS = 4_000;
const MAX_RESULTS_CAP = 20;
const MAX_CHARS_CAP = 20_000;

type SearchHit = {
  index: number;
  excerpt: string;
};

type SearchHistoryOutput = {
  query: string;
  totalMatches: number;
  returned: number;
  results: SearchHit[];
};

export class SearchHistoryTool extends BaseTool<typeof SearchHistorySchema> {
  name = 'search_history';
  description = 'Search compacted history in workspace/memory/HISTORY.md.';
  schema = SearchHistorySchema;

  async execute(
    args: z.infer<typeof SearchHistorySchema>,
    context: AgentContext
  ): Promise<ToolResult> {
    const workspace = context.config.workspacePath;
    const historyPath = path.join(workspace, 'memory', 'HISTORY.md');

    const query = args.query.trim();
    const caseSensitive = args.caseSensitive ?? false;
    const maxResults = Math.min(args.maxResults ?? DEFAULT_MAX_RESULTS, MAX_RESULTS_CAP);
    const maxChars = Math.min(args.maxChars ?? DEFAULT_MAX_CHARS, MAX_CHARS_CAP);

    try {
      const content = await fs.readFile(historyPath, 'utf-8');
      const blocks = content
        .split(/\n{2,}/g)
        .map((block) => block.trim())
        .filter((block) => block.length > 0);

      const normalizedQuery = caseSensitive ? query : query.toLowerCase();
      const hits: SearchHit[] = [];

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const normalizedBlock = caseSensitive ? block : block.toLowerCase();
        if (!normalizedBlock.includes(normalizedQuery)) continue;
        hits.push({ index: i + 1, excerpt: truncate(block, maxChars) });
      }

      const output: SearchHistoryOutput = {
        query,
        totalMatches: hits.length,
        returned: Math.min(hits.length, maxResults),
        results: hits.slice(0, maxResults),
      };

      return this.success(JSON.stringify(output));
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        const output: SearchHistoryOutput = {
          query,
          totalMatches: 0,
          returned: 0,
          results: [],
        };
        return this.success(JSON.stringify(output));
      }
      return this.error(error?.message || 'Failed to search history.', error?.code || 'history_search_failed');
    }
  }
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[TRUNCATED TO ${maxChars} CHARS]`;
}
