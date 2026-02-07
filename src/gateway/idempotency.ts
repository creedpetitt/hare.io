import type { GatewayResponse } from './protocol.js';

type CacheEntry = { response: GatewayResponse; expiresAt: number };

type IdempotencyState = {
  idempotencyCache: Map<string, CacheEntry>;
};

export function readIdempotency(state: IdempotencyState, key: string): GatewayResponse | undefined {
  pruneIdempotency(state);
  const entry = state.idempotencyCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    state.idempotencyCache.delete(key);
    return undefined;
  }
  return entry.response;
}

export function storeIdempotency(
  state: IdempotencyState,
  key: string | undefined,
  response: GatewayResponse,
  ttlMs: number
): void {
  if (!key) return;
  pruneIdempotency(state);
  state.idempotencyCache.set(key, { response, expiresAt: Date.now() + ttlMs });
}

function pruneIdempotency(state: IdempotencyState): void {
  const now = Date.now();
  for (const [cacheKey, entry] of state.idempotencyCache.entries()) {
    if (entry.expiresAt <= now) state.idempotencyCache.delete(cacheKey);
  }
}
