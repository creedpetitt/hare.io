import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, type GatewayFrame, type GatewayResponse } from '@gateway/protocol.js';

const GATEWAY_OPEN_TIMEOUT_MS = 5_000;
const GATEWAY_RESPONSE_TIMEOUT_MS = 5_000;

export async function probeGateway(
  url: string,
  token: string
): Promise<{ protocol: number }> {
  const socket = new WebSocket(url);
  try {
    await waitForOpen(socket);
    socket.send(
      JSON.stringify({
        type: 'req',
        id: 'status-connect',
        method: 'connect',
        params: {
          minProtocol: PROTOCOL_VERSION,
          maxProtocol: PROTOCOL_VERSION,
          client: {
            id: 'hare-status',
            version: '0.0.0',
            platform: process.platform,
            mode: 'operator',
          },
          role: 'operator',
          scopes: ['operator.read'],
          auth: { token },
        },
      })
    );

    const response = await waitForResponse(socket, 'status-connect');

    if (!response.ok) {
      throw new Error(response.error?.message || 'Gateway rejected status check.');
    }

    const payload = response.payload as { protocol?: number } | undefined;
    return { protocol: payload?.protocol ?? PROTOCOL_VERSION };
  } finally {
    socket.terminate();
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === socket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Gateway connection timed out'));
    }, GATEWAY_OPEN_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener('open', onOpen);
      socket.removeListener('error', onError);
    };

    const onOpen = () => {
      cleanup();
      resolve();
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    socket.once('open', onOpen);
    socket.once('error', onError);
  });
}

function waitForResponse(socket: WebSocket, expectedId: string): Promise<GatewayResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Gateway response timed out'));
    }, GATEWAY_RESPONSE_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      socket.off('error', onError);
    };

    const onMessage = (raw: Buffer) => {
      let parsed: GatewayFrame;
      try {
        parsed = JSON.parse(raw.toString()) as GatewayFrame;
      } catch {
        return;
      }

      if (parsed.type !== 'res') return;
      if (parsed.id !== expectedId) return;

      cleanup();
      resolve(parsed as GatewayResponse);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    socket.on('message', onMessage);
    socket.on('error', onError);
  });
}
