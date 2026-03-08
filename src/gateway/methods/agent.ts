import type { WebSocket } from 'ws';
import crypto from 'crypto';
import { 
  type AgentRequest, 
  type AgentLifecycleEventPayload, 
  type AgentUsageEventPayload,
  type ToolStreamEventPayload 
} from '../protocol.js';
import { buildResponse, sendResponse, sendEvent } from '../responses.js';
import { storeIdempotency } from '../idempotency.js';
import { getConfiguredLLM } from '../../core/llm/getLLM.js';
import { loadConfig } from '../../core/config.js';
import { Agent } from '../../core/Agent.js';
import { getOrCreateSessionLane } from '../sessionLanes.js';
import { registerActiveRun, updateActiveRunStart, removeActiveRun } from '../runs.js';
import { parseAgentRequest } from './agentParser.js';

const IDEMPOTENCY_TTL_MS = 120_000;
const AGENT_TIMEOUT_MS = 300_000;

export async function handleAgent(
  socket: WebSocket,
  state: { connected: boolean },
  request: AgentRequest,
  streamEmitter: { 
    enqueue: (runId: string, delta: string, index: number) => void;
    finalize: (runId: string) => void;
  }
): Promise<void> {
  const runId = crypto.randomUUID();
  const queuedAt = Date.now();
  const accepted = buildResponse(request.id, true, { runId, status: 'accepted' });
  sendResponse(socket, accepted);
  storeIdempotency(request.idempotencyKey, accepted, IDEMPOTENCY_TTL_MS);

  try {
    const params = request.params;
    const sessionId = params.sessionId || 'main';
    const agentId = params.agentId || 'main';
    
    const parsed = await parseAgentRequest(params.input, agentId, sessionId, params.profile);

    if (parsed.type === 'command') {
      const response = buildResponse(request.id, true, { runId, status: 'ok', summary: parsed.summary });
      sendResponse(socket, response);
      storeIdempotency(request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
      return;
    }

    const { llm, model } = await getConfiguredLLM({
      errorCode: 'unconfigured',
      errorMessage: 'No API Key configured for the preferred provider.',
    });
    const config = await loadConfig();
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

      let lastUsage: AgentUsageEventPayload | undefined;

      const agent = new Agent(
        sessionId,
        llm,
        agentId,
        {
          model,
          debug: process.env.DEBUG === 'true',
          tools: parsed.type === 'skill' && parsed.toolConfigOverride 
            ? { profile: parsed.toolConfigOverride.profile, allow: parsed.toolConfigOverride.allow }
            : (params.profile ? { profile: params.profile as any } : undefined),
          maxToolIterations: config.agents?.defaults?.maxToolIterations,
          bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars,
          skills: config.agents?.defaults?.skills,
        },
        {
          runId,
          abortSignal: activeRun.abortController.signal,
          toolObserver: {
            onToolStart: (toolRunId, toolName, input) =>
              emitToolStream(socket, { runId: toolRunId, toolName, phase: 'start', input }),
            onToolEnd: (toolRunId, toolName, output) =>
              emitToolStream(socket, { runId: toolRunId, toolName, phase: 'end', output }),
            onToolError: (toolRunId, toolName, error) =>
              emitToolStream(socket, { runId: toolRunId, toolName, phase: 'error', error }),
          },
          assistantObserver: {
            onAssistantDelta: (assistantRunId, delta, index) =>
              streamEmitter.enqueue(assistantRunId, delta, index),
            onUsage: (usageRunId, usage) => {
              lastUsage = { runId: usageRunId, ...usage };
              emitAgentUsage(socket, lastUsage);
            },
          },
        }
      );

      try {
        const result = await runWithTimeout(agent.run(parsed.input, { forcedSkills: parsed.forcedSkills }), AGENT_TIMEOUT_MS);
        const endedAt = Date.now();
        streamEmitter.finalize(runId);
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

        const response = buildResponse(request.id, true, { runId, status: 'ok', summary: result, usage: lastUsage });
        sendResponse(socket, response);
        storeIdempotency(request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
      } catch (error: any) {
        const endedAt = Date.now();
        const isCancelled = error?.code === 'agent_cancelled';
        const errorPayload = {
          code: error?.code || 'agent_error',
          message: error?.message || 'Agent run failed',
        };
        streamEmitter.finalize(runId);
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
          usage: lastUsage,
        });
        sendResponse(socket, response);
        storeIdempotency(request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
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
    storeIdempotency(request.idempotencyKey, response, IDEMPOTENCY_TTL_MS);
  }
}

function emitAgentLifecycle(socket: WebSocket, payload: AgentLifecycleEventPayload) {
  sendEvent(socket, 'agent.lifecycle', payload as any);
}

function emitAgentUsage(socket: WebSocket, payload: AgentUsageEventPayload) {
  sendEvent(socket, 'agent.usage', payload as any);
}

function emitToolStream(socket: WebSocket, payload: ToolStreamEventPayload) {
  sendEvent(socket, 'agent.tool', payload as any);
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
