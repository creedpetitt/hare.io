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
  parseGatewayRequest, AgentUsageEventPayload,
} from './protocol.js';
import { getGatewayToken, validateToken } from './auth.js';
import { Agent } from '../core/Agent.js';
import { loadConfig } from '../core/config.js';
import { getConfiguredLLM } from '../core/llm/getLLM.js';
import { getOrCreateSessionLane } from './sessionLanes.js';
import { registerActiveRun, updateActiveRunStart, removeActiveRun, cancelRun } from './runs.js';
import { readIdempotency, storeIdempotency } from './idempotency.js';
import { buildResponse, sendResponse, sendEvent, sendError } from './responses.js';
import { startTelegramChannel, stopTelegramChannel } from './channels/telegram.js';
import { startDiscordChannel, stopDiscordChannel } from './channels/discord.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { parseStandaloneSlashCommand } from './commands/parse.js';
import { dispatchGatewayCommand } from './commands/dispatch.js';
import { resolveSkillInvocation } from './commands/skill.js';

import { createStreamEmitter, type StreamEmitter } from './StreamManager.js';

type ConnectionState = {
  connected: boolean;
  requestCount: number;
  windowStartMs: number;
  idempotencyCache: Map<string, { response: GatewayResponse; expiresAt: number }>;
};

const DEFAULT_PORT = 18789;
const AGENT_TIMEOUT_MS = 300_000;
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
    const streamEmitter = createStreamEmitter(socket);

    socket.on('message', async (raw: Buffer) => {
      await handleMessage(raw, socket, state, streamEmitter);
    });

    socket.on('close', () => {
      state.connected = false;
      streamEmitter.shutdown();
    });
  });

  return app;
}

import { handleConnect } from './methods/connect.js';
import { handleAgent } from './methods/agent.js';
import { handleCancel } from './methods/cancel.js';

async function handleMessage(
  raw: Buffer,
  socket: WebSocket,
  state: ConnectionState,
  streamEmitter: StreamEmitter
) {
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
    const cached = readIdempotency(request.idempotencyKey);
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

    await handleConnect(socket, request, state);
    return;
  }

  if (request.method === 'ping') {
    const response = buildResponse(request.id, true, { type: 'pong' });
    sendResponse(socket, response);
    storeIdempotency(request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
    return;
  }

  if (request.method === 'agent') {
    void handleAgent(socket, state, request, streamEmitter);
    return;
  }

  if (request.method === 'cancel') {
    handleCancel(socket, state, request);
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

async function start() {
  const app = await buildServer();
  const config = await loadConfig();
  const port = Number(process.env.GATEWAY_PORT) || config.gateway?.port || DEFAULT_PORT;
  await app.listen({ port, host: '127.0.0.1' });
  await startTelegramChannel();
  await startDiscordChannel();
  await startScheduler();

  const shutdown = async (signal: string) => {
    try {
      app.log.info({ signal }, 'Gateway shutting down');
      await stopTelegramChannel();
      await stopDiscordChannel();
      await stopScheduler();
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
