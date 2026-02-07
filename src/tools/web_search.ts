/**
 * web_search tool entrypoint.
 * - Executes search against configured provider (Brave first).
 * - Returns structured results: title, url, snippet, publishedAt (if available).
 * - Enforces limits: maxResults, timeout, cache TTL.
 * - Provides clear setup errors when API key missing.
 * - Delegates provider calls to src/tools/web/fetch.ts (HTTP) and shared types.
 */
