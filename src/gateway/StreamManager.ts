import type { WebSocket } from 'ws';
import { sendEvent } from './responses.js';
import type { AgentStreamEventPayload } from './protocol.js';

const STREAM_FLUSH_INTERVAL_MS = 30;
const STREAM_MAX_DELTA_CHARS = 8_000;
const STREAM_BACKPRESSURE_LIMIT_BYTES = 1_000_000;
const STREAM_BACKPRESSURE_RETRY_MS = 60;
const STREAM_MAX_BACKPRESSURE_CHARS = 20_000;
const SOCKET_OPEN_STATE = 1;

type StreamState = {
  buffer: string;
  lastIndex: number;
  timer?: NodeJS.Timeout;
  retryTimer?: NodeJS.Timeout;
  backpressure: boolean;
};

export interface StreamEmitter {
  enqueue: (runId: string, delta: string, index: number) => void;
  finalize: (runId: string) => void;
  shutdown: () => void;
}

export function createStreamEmitter(socket: WebSocket): StreamEmitter {
  const streams = new Map<string, StreamState>();

  const canSend = () =>
    socket.readyState === SOCKET_OPEN_STATE &&
    socket.bufferedAmount < STREAM_BACKPRESSURE_LIMIT_BYTES;

  const getState = (runId: string) => {
    const existing = streams.get(runId);
    if (existing) return existing;
    const created: StreamState = { buffer: '', lastIndex: 0, backpressure: false };
    streams.set(runId, created);
    return created;
  };

  const flush = (runId: string) => {
    const state = streams.get(runId);
    if (!state || !state.buffer) return;
    if (!canSend()) {
      state.backpressure = true;
      scheduleRetry(runId, state);
      return;
    }

    state.backpressure = false;
    const payload: AgentStreamEventPayload = {
      runId,
      delta: state.buffer,
      index: state.lastIndex,
    };
    state.buffer = '';
    sendEvent(socket, 'agent.stream', payload);
  };

  const scheduleFlush = (runId: string, state: StreamState) => {
    if (state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = undefined;
      flush(runId);
    }, STREAM_FLUSH_INTERVAL_MS);
  };

  const scheduleRetry = (runId: string, state: StreamState) => {
    if (state.retryTimer) return;
    state.retryTimer = setTimeout(() => {
      state.retryTimer = undefined;
      flush(runId);
    }, STREAM_BACKPRESSURE_RETRY_MS);
  };

  const enqueue = (runId: string, delta: string, index: number) => {
    if (!delta) return;
    const state = getState(runId);
    state.lastIndex = index;

    if (state.backpressure) {
      const next = `${state.buffer}${delta}`;
      state.buffer = next.slice(-STREAM_MAX_BACKPRESSURE_CHARS);
      scheduleRetry(runId, state);
      return;
    }

    state.buffer += delta;
    if (state.buffer.length >= STREAM_MAX_DELTA_CHARS) {
      flush(runId);
    } else {
      scheduleFlush(runId, state);
    }
  };

  const finalize = (runId: string) => {
    const state = streams.get(runId);
    if (!state) return;

    if (state.timer) clearTimeout(state.timer);
    if (state.retryTimer) clearTimeout(state.retryTimer);

    if (state.buffer && canSend()) {
      const payload: AgentStreamEventPayload = {
        runId,
        delta: state.buffer,
        index: state.lastIndex,
      };
      sendEvent(socket, 'agent.stream', payload);
    }

    streams.delete(runId);
  };

  const shutdown = () => {
    for (const runId of streams.keys()) {
      finalize(runId);
    }
  };

  return { enqueue, finalize, shutdown };
}
