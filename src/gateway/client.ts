import { WebSocket } from 'ws';
import crypto from 'crypto';
import {
  PROTOCOL_VERSION,
  type AgentParams,
  type AgentFinalPayload,
  type AgentAcceptedPayload,
  type GatewayFrame,
  type GatewayResponse,
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

  constructor(options: GatewayClientOptions & { onStream?: (delta: string) => void }) {
    this.url = options.url;
    this.token = options.token;
    this.clientId = options.clientId || 'cli';
    this.clientVersion = options.clientVersion || '0.0.0';
    this.clientPlatform = options.clientPlatform || process.platform;
    this.clientMode = options.clientMode || 'operator';
    this.scopes = options.scopes || ['operator.read', 'operator.write'];
    this.onStream = options.onStream;
  }

  async runAgent(params: AgentParams): Promise<string> {
    const socket = new WebSocket(this.url);
    try {
      await this.waitForOpen(socket);
      await this.sendConnect(socket);

      const connectResult = await this.waitForResponse(socket);
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

      if (this.onStream) {
        this.listenForStreamEvents(socket, requestId);
      }

      let accepted = false;
      while (true) {
        const response = await this.waitForResponse(socket, requestId);
        if (!response.ok) {
          throw new Error(response.error?.message || 'Agent run failed.');
        }

        const payload = response.payload as AgentAcceptedPayload | AgentFinalPayload | undefined;
        if (!payload || !('status' in payload)) {
          continue;
        }

        if (payload.status === 'accepted') {
          accepted = true;
          continue;
        }

        if (payload.status === 'ok') {
          if (!accepted) {
            throw new Error('Agent run ended without acceptance.');
          }
          return payload.summary;
        }

        if (payload.status === 'error') {
          throw new Error(payload.error?.message || 'Agent run failed.');
        }

        if (payload.status === 'cancelled') {
          throw new Error(payload.error?.message || 'Agent run cancelled.');
        }
      }
    } finally {
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

  private waitForOpen(socket: WebSocket): Promise<void> {
    if (socket.readyState === socket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
  }

  private waitForResponse(socket: WebSocket, expectedId?: string): Promise<GatewayResponse> {
    return new Promise((resolve, reject) => {
      const onMessage = (raw: Buffer) => {
        let parsed: GatewayFrame;
        try {
          parsed = JSON.parse(raw.toString()) as GatewayFrame;
        } catch {
          return;
        }

        if (parsed.type !== 'res') return;
        if (expectedId && parsed.id !== expectedId) return;

        socket.off('message', onMessage);
        socket.off('error', onError);
        resolve(parsed as GatewayResponse);
      };

      const onError = (err: Error) => {
        socket.off('message', onMessage);
        socket.off('error', onError);
        reject(err);
      };

      socket.on('message', onMessage);
      socket.on('error', onError);
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
