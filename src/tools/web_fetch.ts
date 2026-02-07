import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import type { ToolResult } from '../core/types.js';
import { fetchUrl } from './web/fetch.js';
import { extractReadableContent } from './web/readability.js';
import type { WebFetchInput, WebFetchOutput } from './web/types.js';
import { SimpleTTLCache, normalizeCacheKey } from './web/cache.js';

const WebFetchSchema = z.object({
  url: z.string().describe('Absolute URL to fetch.'),
  timeoutMs: z.number().int().positive().optional().describe('Request timeout in ms.'),
  maxChars: z.number().int().positive().optional().describe('Maximum chars to return.'),
  maxRedirects: z.number().int().positive().optional().describe('Maximum redirects to follow.'),
  extractMode: z.enum(['markdown', 'text']).optional().describe('Content extraction mode.'),
});

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 40_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 2_000_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

const cache = new SimpleTTLCache<WebFetchOutput>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

export class WebFetchTool extends BaseTool<typeof WebFetchSchema> {
  name = 'web_fetch';
  description = 'Fetch a public web page and return readable content.';
  schema = WebFetchSchema;

  async execute(args: z.infer<typeof WebFetchSchema>): Promise<ToolResult> {
    const input = args as WebFetchInput;

    try {
      const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
      const maxRedirects = input.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
      const extractMode = input.extractMode ?? 'markdown';

      const cacheKey = normalizeCacheKey(
        JSON.stringify({ url: input.url, extractMode, maxChars })
      );
      const cached = cache.get(cacheKey);
      if (cached) {
        return this.success(JSON.stringify(cached));
      }

      const fetched = await fetchUrl(input.url, {
        timeoutMs,
        maxRedirects,
        maxBytes: DEFAULT_MAX_BYTES,
        security: { allowPrivate: false },
      });

      const extracted = extractReadableContent(fetched.body, {
        extractMode,
        maxChars,
      });

      const output: WebFetchOutput = {
        url: fetched.url,
        title: extracted.title,
        content: extracted.content,
        length: extracted.content.length,
        truncated: extracted.truncated,
        status: fetched.status,
        contentType: fetched.contentType,
      };

      cache.set(cacheKey, output);

      return this.success(JSON.stringify(output));
    } catch (error: any) {
      const code = error?.code || 'fetch_failed';
      const message = error?.message || 'Fetch failed.';
      return this.error(message, code);
    }
  }
}
