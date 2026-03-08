import type { WebSocket } from 'ws';
import { type CancelRequest } from '../protocol.js';
import { buildResponse, sendResponse } from '../responses.js';
import { storeIdempotency } from '../idempotency.js';
import { cancelRun } from '../runs.js';

const IDEMPOTENCY_TTL_MS = 120_000;

export function handleCancel(
  socket: WebSocket,
  state: { connected: boolean },
  request: CancelRequest
): void {
  const runId = request.params.runId;
  const cancelled = cancelRun(runId);
  const response = buildResponse(request.id, true, {
    runId,
    status: cancelled ? 'cancelled' : 'not_found',
    reason: request.params.reason,
  });
  sendResponse(socket, response);
  storeIdempotency(request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
}
