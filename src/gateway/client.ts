import { WebSocket } from 'ws';
import crypto from 'crypto';
import {
  PROTOCOL_VERSION,
  type AgentParams,
  type AgentFinalPayload,
  type AgentAcceptedPayload,
  type GatewayFrame,
  type GatewayResponse,
  type ToolStreamEventPayload,
  type AgentUsageEventPayload,
} from './protocol.js';

export type GatewayClientOptions = {
  url: string;
  token: string;
  clientId?: string;
  clientVersion?: string;
  clientPlatform?: string;
  clientMode?: string;
  scopes?: string[];
};

export class GatewayClient {
  private url: string;
  private token: string;
  private clientId: string;
  private clientVersion: string;
  private clientPlatform: string;
  private clientMode: string;
  private scopes: string[];
  private onStream?: (delta: string) => void;
  private onTool?: (payload: ToolStreamEventPayload) => void;
  private onUsage?: (payload: AgentUsageEventPayload) => void;

  constructor(options: GatewayClientOptions & { onStream?: (delta: string) => void; onTool?: (payload: ToolStreamEventPayload) => void; onUsage?: (payload: AgentUsageEventPayload) => void }) {
    this.url = options.url;
    this.token = options.token;
    this.clientId = options.clientId || 'cli';
    this.clientVersion = options.clientVersion || '0.0.0';
    this.clientPlatform = options.clientPlatform || process.platform;
    this.clientMode = options.clientMode || 'operator';
    this.scopes = options.scopes || ['operator.read', 'operator.write'];
    this.onStream = options.onStream;
    this.onTool = options.onTool;
    this.onUsage = options.onUsage;
  }

  async runAgent(
    params: AgentParams,
    options?: {
      abortSignal?: AbortSignal;
    }
  ): Promise<string> {
    const socket = new WebSocket(this.url);
    let acceptedRunId: string | undefined;
    const abortSignal = options?.abortSignal;
    const abortError = () => {
      const err: any = new Error('Agent run cancelled.');
      err.code = 'agent_cancelled';
      return err;
    };
    const cancelAcceptedRun = () => {
      if (!acceptedRunId) return;
      if (socket.readyState !== socket.OPEN) return;
      this.sendFrame(socket, {
        type: 'req',
        id: crypto.randomUUID(),
        method: 'cancel',
        params: {
          runId: acceptedRunId,
          reason: 'operator_abort',
        },
      });
    };
    const onAbort = () => {
      cancelAcceptedRun();
      socket.close();
    };

    try {
      if (abortSignal?.aborted) throw abortError();
      await this.waitForOpen(socket, abortSignal);
      await this.sendConnect(socket);

      const connectResult = await this.waitForResponse(socket, undefined, abortSignal);
      if (!connectResult.ok) {
        throw new Error(connectResult.error?.message || 'Gateway connect failed.');
      }

      const requestId = crypto.randomUUID();
      this.sendFrame(socket, {
        type: 'req',
        id: requestId,
        method: 'agent',
        params,
      });

      if (this.onStream || this.onTool || this.onUsage) {
        this.listenForStreamEvents(socket, requestId);
      }
      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      let accepted = false;
      while (true) {
        if (abortSignal?.aborted) throw abortError();
        const response = await this.waitForResponse(socket, requestId, abortSignal);
        if (!response.ok) {
          throw new Error(response.error?.message || 'Agent run failed.');
        }

        const payload = response.payload as AgentAcceptedPayload | AgentFinalPayload | undefined;
        if (!payload || !('status' in payload)) {
          continue;
        }

        if (payload.status === 'accepted') {
          accepted = true;
          acceptedRunId = payload.runId;
          continue;
        }

        if (payload.status === 'ok') {
          if (!accepted) {
            throw new Error('Agent run ended without acceptance.');
          }
          if (payload.usage) {
            this.onUsage?.(payload.usage);
          }
          return payload.summary;
        }

        if (payload.status === 'error') {
          if (payload.usage) {
            this.onUsage?.(payload.usage);
          }
          throw new Error(payload.error?.message || 'Agent run failed.');
        }

        if (payload.status === 'cancelled') {
          if (payload.usage) {
            this.onUsage?.(payload.usage);
          }
          throw new Error(payload.error?.message || 'Agent run cancelled.');
        }
      }
    } catch (error: any) {
      if (abortSignal?.aborted || error?.code === 'agent_cancelled') {
        throw abortError();
      }
      throw error;
    } finally {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
      socket.close();
    }
  }

  private async sendConnect(socket: WebSocket): Promise<void> {
    this.sendFrame(socket, {
      type: 'req',
      id: crypto.randomUUID(),
      method: 'connect',
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: this.clientId,
          version: this.clientVersion,
          platform: this.clientPlatform,
          mode: this.clientMode,
        },
        role: 'operator',
        scopes: this.scopes,
        auth: { token: this.token },
      },
    });
  }

  private sendFrame(socket: WebSocket, frame: GatewayFrame) {
    socket.send(JSON.stringify(frame));
  }

  private waitForOpen(socket: WebSocket, abortSignal?: AbortSignal): Promise<void> {
    if (socket.readyState === socket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off('open', onOpen);
        socket.off('error', onError);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onAbort = () => {
        cleanup();
        const err: any = new Error('Agent run cancelled.');
        err.code = 'agent_cancelled';
        reject(err);
      };

      socket.on('open', onOpen);
      socket.on('error', onError);
      if (abortSignal) {
        if (abortSignal.aborted) {
          onAbort();
          return;
        }
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private waitForResponse(
    socket: WebSocket,
    expectedId?: string,
    abortSignal?: AbortSignal
  ): Promise<GatewayResponse> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off('message', onMessage);
        socket.off('error', onError);
        socket.off('close', onClose);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
      };

      const onMessage = (raw: Buffer) => {
        let parsed: GatewayFrame;
        try {
          parsed = JSON.parse(raw.toString()) as GatewayFrame;
        } catch {
          return;
        }

        if (parsed.type !== 'res') return;
        if (expectedId && parsed.id !== expectedId) return;

        cleanup();
        resolve(parsed as GatewayResponse);
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Gateway connection closed before response.'));
      };
      const onAbort = () => {
        cleanup();
        const err: any = new Error('Agent run cancelled.');
        err.code = 'agent_cancelled';
        reject(err);
      };

      socket.on('message', onMessage);
      socket.on('error', onError);
      socket.on('close', onClose);
      if (abortSignal) {
        if (abortSignal.aborted) {
          onAbort();
          return;
        }
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private listenForStreamEvents(socket: WebSocket, requestId: string) {
    const onMessage = (raw: Buffer) => {
      let parsed: GatewayFrame;
      try {
        parsed = JSON.parse(raw.toString()) as GatewayFrame;
      } catch {
        return;
      }

      if (parsed.type === 'event' && parsed.event === 'agent.stream') {
        const delta = (parsed.payload as { delta?: string } | undefined)?.delta;
        if (delta) this.onStream?.(delta);
      }

      if (parsed.type === 'event' && parsed.event === 'agent.tool') {
        this.onTool?.(parsed.payload as ToolStreamEventPayload);
      }

      if (parsed.type === 'event' && parsed.event === 'agent.usage') {
        this.onUsage?.(parsed.payload as AgentUsageEventPayload);
      }

      if (parsed.type === 'res' && parsed.id === requestId) {
        const payload = parsed.payload as AgentAcceptedPayload | AgentFinalPayload | undefined;
        if (payload && 'status' in payload && payload.status === 'accepted') {
          return;
        }
        socket.off('message', onMessage);
      }
    };

    socket.on('message', onMessage);
  }
}
