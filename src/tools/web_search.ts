import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import type { ToolResult } from '../core/types.js';
import { loadConfig } from '../core/config.js';
import type { WebSearchInput, WebSearchOutput, WebSearchResult } from './web/types.js';
import { PersistentCache, normalizeCacheKey } from './web/cache.js';

const WebSearchSchema = z.object({
  query: z.string().min(1).describe('Search query.'),
  maxResults: z.number().int().positive().optional().describe('Maximum results to return.'),
  timeoutMs: z.number().int().positive().optional().describe('Request timeout in ms.'),
  country: z.string().optional().describe('Country code for search results (e.g. US).'),
  searchLang: z.string().optional().describe('Search language code (e.g. en).'),
});

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_RESULTS_CAP = 20;

const cache = new PersistentCache<WebSearchOutput>();

export class WebSearchTool extends BaseTool<typeof WebSearchSchema> {
  name = 'web_search';
  description = 'Search the web and return top results.';
  schema = WebSearchSchema;

  async execute(args: z.infer<typeof WebSearchSchema>): Promise<ToolResult> {
    try {
      const config = await loadConfig();
      const provider = config.tools?.web?.search?.provider ?? 'brave';
      const apiKey = config.tools?.web?.search?.apiKey ?? process.env.BRAVE_API_KEY;

      if (provider !== 'brave') {
        return this.error(`Unsupported search provider: ${provider}`, 'unsupported_provider');
      }

      if (!apiKey) {
        return this.error(
          'Brave Search API key missing. Set BRAVE_API_KEY or configure tools.web.search.apiKey.',
          'missing_api_key'
        );
      }

      const timeoutMs =
        args.timeoutMs ?? config.tools?.web?.search?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const maxResultsCap =
        config.tools?.web?.search?.maxResultsCap ?? DEFAULT_MAX_RESULTS_CAP;
      const maxResults = Math.min(
        args.maxResults ?? config.tools?.web?.search?.maxResults ?? DEFAULT_MAX_RESULTS,
        maxResultsCap
      );
      const country = args.country ?? config.tools?.web?.search?.country;
      const searchLang = args.searchLang ?? config.tools?.web?.search?.searchLang;

      const cacheKey = normalizeCacheKey(
        JSON.stringify({ query: args.query, maxResults, country, searchLang })
      );
      const cached = await cache.get(cacheKey);
      if (cached) {
        return this.success(JSON.stringify(cached));
      }

      const output = await runBraveSearch(
        args.query,
        maxResults,
        apiKey,
        timeoutMs,
        country,
        searchLang
      );
      await cache.set(cacheKey, output);
      return this.success(JSON.stringify(output));
    } catch (error: any) {
      const code = error?.code || 'search_failed';
      const message = error?.message || 'Search failed.';
      return this.error(message, code);
    }
  }
}

async function runBraveSearch(
  query: string,
  maxResults: number,
  apiKey: string,
  timeoutMs: number,
  country?: string,
  searchLang?: string,
  retryCount = 0
): Promise<WebSearchOutput> {
  const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('count', String(maxResults));
  if (country) endpoint.searchParams.set('country', country);
  if (searchLang) endpoint.searchParams.set('search_lang', searchLang);

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
      signal: abortController.signal,
    });

    if (response.status === 429 && retryCount < 1) {
      // Free tier rate limit is 1 req/sec. Wait and retry once.
      clearTimeout(timeoutId);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return runBraveSearch(query, maxResults, apiKey, timeoutMs, country, searchLang, retryCount + 1);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const err: any = new Error(`Brave Search API error (${response.status}). ${body}`);
      err.code = response.status === 401 ? 'unauthorized' : 'search_failed';
      throw err;
    }

    const json = (await response.json()) as any;
    const rawResults = (json?.web?.results ?? []) as any[];
    const results: WebSearchResult[] = rawResults.slice(0, maxResults).map((item) => {
      const title = String(item?.title ?? '');
      const url = String(item?.url ?? '');
      const snippet = String(item?.description ?? item?.snippet ?? '');
      const publishedAt =
        typeof item?.published === 'string'
          ? item.published
          : typeof item?.age === 'string'
            ? item.age
            : undefined;
      return { title, url, snippet, publishedAt };
    });

    return { query, results };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      const err: any = new Error('Search request timed out.');
      err.code = 'timeout';
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
