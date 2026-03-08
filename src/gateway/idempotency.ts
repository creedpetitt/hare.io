import type { GatewayResponse } from './protocol.js';

type CacheEntry = { response: GatewayResponse; expiresAt: number };

// Global cache to persist across client reconnections
const globalIdempotencyCache = new Map<string, CacheEntry>();

export function readIdempotency(key: string): GatewayResponse | undefined {
  pruneIdempotency();
  const entry = globalIdempotencyCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    globalIdempotencyCache.delete(key);
    return undefined;
  }
  return entry.response;
}

export function storeIdempotency(
  key: string | undefined,
  response: GatewayResponse,
  ttlMs: number
): void {
  if (!key) return;
  pruneIdempotency();
  globalIdempotencyCache.set(key, { response, expiresAt: Date.now() + ttlMs });
}

function pruneIdempotency(): void {
  const now = Date.now();
  for (const [cacheKey, entry] of globalIdempotencyCache.entries()) {
    if (entry.expiresAt <= now) globalIdempotencyCache.delete(cacheKey);
  }
}

/**
 * Clear the entire idempotency cache (useful for tests)
 */
export function clearIdempotencyCache(): void {
  globalIdempotencyCache.clear();
}
