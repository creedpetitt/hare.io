/**
 * Simple TTL cache for web_search/web_fetch results.
 * - Keyed by normalized URL or query.
 * - In-memory cache (can evolve to disk-backed later).
 * - Provides get/set with TTL and optional size caps.
 */
