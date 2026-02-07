import type { GatewayEvent, GatewayResponse } from './protocol.js';
import type { WebSocket } from 'ws';

export function buildResponse(
  id: string,
  ok: boolean,
  payload?: GatewayResponse['payload'],
  error?: GatewayResponse['error']
): GatewayResponse {
  return { type: 'res', id, ok, payload, error };
}

export function sendResponse(socket: WebSocket, frame: GatewayResponse): void {
  socket.send(JSON.stringify(frame));
}

export function sendEvent(
  socket: WebSocket,
  event: string,
  payload?: GatewayEvent['payload']
): void {
  const frame: GatewayEvent = { type: 'event', event, payload };
  socket.send(JSON.stringify(frame));
}

export function sendError(socket: WebSocket, code: string, message: string): void {
  sendResponse(socket, buildResponse('error', false, undefined, { code, message }));
}
