export type ConnectParams = {
  token?: string;
  client?: {
    id?: string;
    version?: string;
    platform?: string;
  };
};

export type ConnectRequest = {
  type: 'req';
  id: string;
  method: 'connect';
  params: ConnectParams;
};

export type PingRequest = {
  type: 'req';
  id: string;
  method: 'ping';
  params?: Record<string, never>;
};

export type GatewayRequest = ConnectRequest | PingRequest;

export type GatewayResponse = {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
};

export type GatewayEvent = {
  type: 'event';
  event: string;
  payload?: Record<string, unknown>;
};

export type GatewayFrame = GatewayRequest | GatewayResponse | GatewayEvent;

export function isGatewayFrame(value: unknown): value is GatewayFrame {
  if (!value || typeof value !== 'object') return false;
  const frame = value as { type?: unknown };
  return frame.type === 'req' || frame.type === 'res' || frame.type === 'event';
}

export function isConnectRequest(frame: GatewayFrame): frame is ConnectRequest {
  return frame.type === 'req' && frame.method === 'connect';
}
