import Fastify, { type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import crypto from 'crypto';
import {
  GatewayFrame,
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  type AgentRequest,
  isGatewayFrame,
  isConnectRequest,
  isAgentRequest,
  isConnectParams,
  isAgentParams,
  PROTOCOL_VERSION,
} from './protocol.js';
import { getGatewayToken, validateToken } from './auth.js';
import { Agent } from '../core/Agent.js';
import { getConfiguredLLM } from '../core/llm/getLLM.js';

type ConnectionState = {
  connected: boolean;
};

const DEFAULT_PORT = 18789;
const DEFAULT_TICK_INTERVAL_MS = 15000;
const DEFAULT_MAX_PAYLOAD_BYTES = 2_000_000;
const DEFAULT_MAX_BUFFERED_BYTES = 5_000_000;
const AGENT_TIMEOUT_MS = 120_000;

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

    if (!isConnectParams(request.params)) {
      sendResponse(socket, request.id, false, undefined, {
        code: 'invalid_request',
        message: 'Invalid connect params',
      });
      socket.close();
      return;
    }

    if (!isProtocolCompatible(request.params.minProtocol, request.params.maxProtocol)) {
      sendResponse(socket, request.id, false, undefined, {
        code: 'protocol_mismatch',
        message: `Unsupported protocol version. Server=${PROTOCOL_VERSION}`,
      });
      socket.close();
      return;
    }

    const expectedToken = await getGatewayToken();
    const providedToken = request.params.auth?.token;
    if (!validateToken(expectedToken, providedToken)) {
      sendResponse(socket, request.id, false, undefined, {
        code: 'unauthorized',
        message: 'Invalid gateway token',
      });
      socket.close();
      return;
    }

    state.connected = true;
    sendResponse(socket, request.id, true, {
      type: 'hello-ok',
      protocol: PROTOCOL_VERSION,
      policy: {
        tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
        maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
        maxBufferedBytes: DEFAULT_MAX_BUFFERED_BYTES,
      },
    });
    return;
  }

  if (request.method === 'ping') {
    sendResponse(socket, request.id, true, { type: 'pong' });
    return;
  }

  if (request.method === 'agent') {
    if (!isAgentRequest(request) || !isAgentParams(request.params)) {
      sendResponse(socket, request.id, false, undefined, {
        code: 'invalid_request',
        message: 'Invalid agent params',
      });
      return;
    }

    void handleAgentRequest(socket, request);
    return;
  }

  sendResponse(socket, request.id, false, undefined, {
    code: 'unknown_method',
    message: `Unknown method: ${request.method}`,
  });
}

async function handleAgentRequest(socket: WebSocket, request: AgentRequest) {
  const runId = crypto.randomUUID();
  sendResponse(socket, request.id, true, { runId, status: 'accepted' });

  try {
    const params = request.params;
    const { llm, model } = await getConfiguredLLM({
      errorCode: 'unconfigured',
      errorMessage: 'No API Key configured for OpenAI or Anthropic.',
    });
    const sessionId = params.sessionId || 'main';
    const agentId = params.agentId || 'main';
    const agent = new Agent(sessionId, llm, agentId, {
      model,
      debug: process.env.DEBUG === 'true',
      tools: params.profile ? { profile: params.profile as any } : undefined,
    });

    const result = await runWithTimeout(agent.run(params.input), AGENT_TIMEOUT_MS);
    sendResponse(socket, request.id, true, { runId, status: 'ok', summary: result });
  } catch (error: any) {
    sendResponse(socket, request.id, true, {
      runId,
      status: 'error',
      error: {
        code: error?.code || 'agent_error',
        message: error?.message || 'Agent run failed',
      },
    });
  }
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

function isProtocolCompatible(minProtocol: number, maxProtocol: number): boolean {
  if (minProtocol > maxProtocol) return false;
  return PROTOCOL_VERSION >= minProtocol && PROTOCOL_VERSION <= maxProtocol;
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err: any = new Error('Agent timed out.');
      err.code = 'agent_timeout';
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function start() {
  const app = await buildServer();
  const port = Number(process.env.GATEWAY_PORT) || DEFAULT_PORT;
  await app.listen({ port, host: '127.0.0.1' });
}

start();
