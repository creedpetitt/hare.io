import Fastify, { type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import crypto from 'crypto';
import {
  GatewayFrame,
  GatewayRequest,
  GatewayResponse,
  type AgentRequest,
  type AgentLifecycleEventPayload,
  type AgentStreamEventPayload,
  type ToolStreamEventPayload,
  isGatewayFrame,
  isConnectRequest,
  PROTOCOL_VERSION,
  parseGatewayRequest,
} from './protocol.js';
import { getGatewayToken, validateToken } from './auth.js';
import { Agent } from '../core/Agent.js';
import { loadConfig } from '../core/config.js';
import { getConfiguredLLM } from '../core/llm/getLLM.js';
import { getOrCreateSessionLane } from './sessionLanes.js';
import { registerActiveRun, updateActiveRunStart, removeActiveRun, cancelRun } from './runs.js';
import { readIdempotency, storeIdempotency } from './idempotency.js';
import { buildResponse, sendResponse, sendEvent, sendError } from './responses.js';

type ConnectionState = {
  connected: boolean;
  requestCount: number;
  windowStartMs: number;
  idempotencyCache: Map<string, { response: GatewayResponse; expiresAt: number }>;
};

const DEFAULT_PORT = 18789;
const DEFAULT_TICK_INTERVAL_MS = 15000;
const DEFAULT_MAX_PAYLOAD_BYTES = 2_000_000;
const DEFAULT_MAX_BUFFERED_BYTES = 5_000_000;
const AGENT_TIMEOUT_MS = 120_000;
const REQUEST_WINDOW_MS = 10_000;
const MAX_REQUESTS_PER_WINDOW = 25;
const IDEMPOTENCY_TTL_MS = 120_000;

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(websocket);

  app.get('/health', async () => ({ ok: true }));

  app.get('/ws', { websocket: true }, (socket: WebSocket, _req: FastifyRequest) => {
    const state: ConnectionState = {
      connected: false,
      requestCount: 0,
      windowStartMs: Date.now(),
      idempotencyCache: new Map(),
    };

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
  if (!recordRequest(state)) {
    sendError(socket, 'rate_limited', 'Too many requests. Slow down.');
    return;
  }
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

  const parsedRequest = parseGatewayRequest(parsed);
  if (!parsedRequest.ok) {
    sendResponse(socket, buildResponse('error', false, undefined, parsedRequest.error));
    return;
  }

  const request = parsedRequest.request as GatewayRequest;

  if (request.idempotencyKey) {
    const cached = readIdempotency(state, request.idempotencyKey);
    if (cached) {
      socket.send(JSON.stringify(cached));
      return;
    }
  }

  if (!state.connected) {
    if (!isConnectRequest(request)) {
      sendResponse(
        socket,
        buildResponse(request.id, false, undefined, {
          code: 'not_connected',
          message: 'First request must be connect',
        })
      );
      return;
    }

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
    storeIdempotency(state, request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
    return;
  }

  if (request.method === 'ping') {
    const response = buildResponse(request.id, true, { type: 'pong' });
    sendResponse(socket, response);
    storeIdempotency(state, request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
    return;
  }

  if (request.method === 'agent') {
    void handleAgentRequest(socket, state, request);
    return;
  }

  if (request.method === 'cancel') {
    const runId = request.params.runId;
    const cancelled = cancelRun(runId);
    const response = buildResponse(request.id, true, {
      runId,
      status: cancelled ? 'cancelled' : 'not_found',
      reason: request.params.reason,
    });
    sendResponse(socket, response);
    storeIdempotency(state, request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
    return;
  }

  sendResponse(
    socket,
    buildResponse(request.id, false, undefined, {
      code: 'unknown_method',
      message: `Unknown method: ${request.method}`,
    })
  );
}

function recordRequest(state: ConnectionState): boolean {
  const now = Date.now();
  if (now - state.windowStartMs > REQUEST_WINDOW_MS) {
    state.windowStartMs = now;
    state.requestCount = 0;
  }

  state.requestCount += 1;
  return state.requestCount <= MAX_REQUESTS_PER_WINDOW;
}

async function handleAgentRequest(
  socket: WebSocket,
  state: ConnectionState,
  request: AgentRequest
) {
  const runId = crypto.randomUUID();
  const queuedAt = Date.now();
  const accepted = buildResponse(request.id, true, { runId, status: 'accepted' });
  sendResponse(socket, accepted);
  storeIdempotency(state, request.idempotencyKey, accepted, IDEMPOTENCY_TTL_MS);

  try {
    const params = request.params;
    const { llm, model } = await getConfiguredLLM({
      errorCode: 'unconfigured',
      errorMessage: 'No API Key configured for OpenAI or Anthropic.',
    });
    const config = await loadConfig();
    const sessionId = params.sessionId || 'main';
    const agentId = params.agentId || 'main';
    const activeRun = registerActiveRun({ runId, sessionId, agentId, queuedAt });

    await getOrCreateSessionLane(sessionId).enqueue(async () => {
      const startedAt = Date.now();
      updateActiveRunStart(runId, startedAt);
      emitAgentLifecycle(socket, {
        runId,
        sessionId,
        agentId,
        phase: 'start',
        queuedAt,
        startedAt,
      });

      const agent = new Agent(
        sessionId,
        llm,
        agentId,
        {
          model,
          debug: process.env.DEBUG === 'true',
          tools: params.profile ? { profile: params.profile as any } : undefined,
          bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars,
        },
        {
          runId,
          abortSignal: activeRun.abortController.signal,
          toolObserver: {
            onToolStart: (toolRunId, toolName, input) =>
              emitToolStream(socket, {
                runId: toolRunId,
                toolName,
                phase: 'start',
                input,
              }),
            onToolEnd: (toolRunId, toolName, output) =>
              emitToolStream(socket, {
                runId: toolRunId,
                toolName,
                phase: 'end',
                output,
              }),
            onToolError: (toolRunId, toolName, error) =>
              emitToolStream(socket, {
                runId: toolRunId,
                toolName,
                phase: 'error',
                error,
              }),
          },
          assistantObserver: {
            onAssistantDelta: (assistantRunId, delta, index) =>
              emitAgentStream(socket, { runId: assistantRunId, delta, index }),
          },
        }
      );

      try {
        const result = await runWithTimeout(agent.run(params.input), AGENT_TIMEOUT_MS);
        const endedAt = Date.now();
        emitAgentLifecycle(socket, {
          runId,
          sessionId,
          agentId,
          phase: 'end',
          status: 'ok',
          queuedAt,
          startedAt,
          endedAt,
          summary: result,
        });

        const response = buildResponse(request.id, true, { runId, status: 'ok', summary: result });
        sendResponse(socket, response);
        storeIdempotency(state, request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
      } catch (error: any) {
        const endedAt = Date.now();
        const isCancelled = error?.code === 'agent_cancelled';
        const errorPayload = {
          code: error?.code || 'agent_error',
          message: error?.message || 'Agent run failed',
        };
        emitAgentLifecycle(socket, {
          runId,
          sessionId,
          agentId,
          phase: 'error',
          status: isCancelled ? 'cancelled' : 'error',
          queuedAt,
          startedAt,
          endedAt,
          error: errorPayload,
        });

        const response = buildResponse(request.id, true, {
          runId,
          status: isCancelled ? 'cancelled' : 'error',
          error: errorPayload,
        });
        sendResponse(socket, response);
        storeIdempotency(state, request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
      } finally {
        removeActiveRun(runId);
      }
    });
  } catch (error: any) {
    const response = buildResponse(request.id, true, {
      runId,
      status: 'error',
      error: {
        code: error?.code || 'agent_error',
        message: error?.message || 'Agent run failed',
      },
    });
    sendResponse(socket, response);
    storeIdempotency(state, request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
  }
}

function emitAgentLifecycle(socket: WebSocket, payload: AgentLifecycleEventPayload) {
  sendEvent(socket, 'agent.lifecycle', payload);
}

function emitAgentStream(socket: WebSocket, payload: AgentStreamEventPayload) {
  sendEvent(socket, 'agent.stream', payload);
}

function emitToolStream(socket: WebSocket, payload: ToolStreamEventPayload) {
  sendEvent(socket, 'agent.tool', payload);
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

  const shutdown = async (signal: string) => {
    try {
      app.log.info({ signal }, 'Gateway shutting down');
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ error, signal }, 'Gateway shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
