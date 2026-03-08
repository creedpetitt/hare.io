import type { WebSocket } from 'ws';
import { 
  PROTOCOL_VERSION, 
  type ConnectRequest, 
  type GatewayResponse 
} from '../protocol.js';
import { getGatewayToken, validateToken } from '../auth.js';
import { buildResponse, sendResponse } from '../responses.js';
import { storeIdempotency } from '../idempotency.js';

const IDEMPOTENCY_TTL_MS = 120_000;
const DEFAULT_TICK_INTERVAL_MS = 15000;
const DEFAULT_MAX_PAYLOAD_BYTES = 2_000_000;
const DEFAULT_MAX_BUFFERED_BYTES = 5_000_000;

export async function handleConnect(
  socket: WebSocket, 
  request: ConnectRequest, 
  state: { connected: boolean }
): Promise<void> {
  if (!isProtocolCompatible(request.params.minProtocol, request.params.maxProtocol)) {
    sendResponse(
      socket,
      buildResponse(request.id, false, undefined, {
        code: 'protocol_mismatch',
        message: `Unsupported protocol version. Server=${PROTOCOL_VERSION}`,
      })
    );
    socket.close();
    return;
  }

  const expectedToken = await getGatewayToken();
  const providedToken = request.params.auth?.token;
  if (!validateToken(expectedToken, providedToken)) {
    sendResponse(
      socket,
      buildResponse(request.id, false, undefined, {
        code: 'unauthorized',
        message: 'Invalid gateway token',
      })
    );
    socket.close();
    return;
  }

  state.connected = true;
  const response = buildResponse(request.id, true, {
    type: 'hello-ok',
    protocol: PROTOCOL_VERSION,
    policy: {
      tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
      maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
      maxBufferedBytes: DEFAULT_MAX_BUFFERED_BYTES,
    },
  });
  sendResponse(socket, response);
  storeIdempotency(request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
}

function isProtocolCompatible(minProtocol: number, maxProtocol: number): boolean {
  if (minProtocol > maxProtocol) return false;
  return PROTOCOL_VERSION >= minProtocol && PROTOCOL_VERSION <= maxProtocol;
}
