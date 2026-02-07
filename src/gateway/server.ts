import Fastify, { type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import {
  GatewayFrame,
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  isGatewayFrame,
  isConnectRequest,
} from './protocol.js';
import { getGatewayToken, validateToken } from './auth.js';

type ConnectionState = {
  connected: boolean;
};

const DEFAULT_PORT = 18789;

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));

  app.get('/ws', { websocket: true }, (socket: WebSocket, _req: FastifyRequest) => {
    const state: ConnectionState = { connected: false };

    socket.on('message', async (raw: Buffer) => {
      await handleMessage(raw, socket, state);
    });

    socket.on('close', () => {
      state.connected = false;
    });
  });

  return app;
}

async function handleMessage(raw: Buffer, socket: WebSocket, state: ConnectionState) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    sendError(socket, 'invalid_json', 'Invalid JSON payload');
    return;
  }

  if (!isGatewayFrame(parsed)) {
    sendError(socket, 'invalid_frame', 'Invalid frame type');
    return;
  }

  if (parsed.type !== 'req') {
    sendError(socket, 'invalid_request', 'Only request frames are accepted');
    return;
  }

  const request = parsed as GatewayRequest;

  if (!state.connected) {
    if (!isConnectRequest(request)) {
      sendResponse(socket, request.id, false, undefined, {
        code: 'not_connected',
        message: 'First request must be connect',
      });
      return;
    }

    const expectedToken = await getGatewayToken();
    const providedToken = request.params?.token;
    if (!validateToken(expectedToken, providedToken)) {
      sendResponse(socket, request.id, false, undefined, {
        code: 'unauthorized',
        message: 'Invalid gateway token',
      });
      socket.close();
      return;
    }

    state.connected = true;
    sendResponse(socket, request.id, true, { type: 'hello-ok' });
    return;
  }

  if (request.method === 'ping') {
    sendResponse(socket, request.id, true, { type: 'pong' });
    return;
  }

  sendResponse(socket, request.id, false, undefined, {
    code: 'unknown_method',
    message: `Unknown method: ${request.method}`,
  });
}

function sendResponse(
  socket: WebSocket,
  id: string,
  ok: boolean,
  payload?: GatewayResponse['payload'],
  error?: GatewayResponse['error']
) {
  const frame: GatewayResponse = { type: 'res', id, ok, payload, error };
  socket.send(JSON.stringify(frame));
}

function sendEvent(socket: WebSocket, event: string, payload?: GatewayEvent['payload']) {
  const frame: GatewayEvent = { type: 'event', event, payload };
  socket.send(JSON.stringify(frame));
}

function sendError(socket: WebSocket, code: string, message: string) {
  const frame: GatewayResponse = {
    type: 'res',
    id: 'error',
    ok: false,
    error: { code, message },
  };
  socket.send(JSON.stringify(frame));
}

async function start() {
  const app = await buildServer();
  const port = Number(process.env.GATEWAY_PORT) || DEFAULT_PORT;
  await app.listen({ port, host: '127.0.0.1' });
}

start();
