export const PROTOCOL_VERSION = 1;

export type ClientRole = 'operator' | 'node';

export type ClientInfo = {
  id: string;
  version: string;
  platform: string;
  mode: string;
  displayName?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  instanceId?: string;
};

export type ConnectAuth = {
  token?: string;
  password?: string;
  deviceToken?: string;
};

export type DeviceIdentity = {
  id?: string;
  publicKey?: string;
  signature?: string;
  signedAt?: number;
  nonce?: string;
};

export type ConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: ClientInfo;
  role: ClientRole;
  scopes: string[];
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, boolean>;
  auth?: ConnectAuth;
  locale?: string;
  userAgent?: string;
  device?: DeviceIdentity;
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

export type AgentParams = {
  input: string;
  sessionId?: string;
  agentId?: string;
  profile?: string;
};

export type AgentRequest = {
  type: 'req';
  id: string;
  method: 'agent';
  params: AgentParams;
};

export type GatewayRequest = ConnectRequest | PingRequest | AgentRequest;

export type HelloOkPayload = {
  type: 'hello-ok';
  protocol: number;
  policy?: {
    tickIntervalMs?: number;
    maxPayloadBytes?: number;
    maxBufferedBytes?: number;
  };
};

export type AgentAcceptedPayload = {
  runId: string;
  status: 'accepted';
};

export type AgentFinalPayload =
  | {
      runId: string;
      status: 'ok';
      summary: string;
    }
  | {
      runId: string;
      status: 'error';
      error: { code: string; message: string };
    };

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

export function isAgentRequest(frame: GatewayFrame): frame is AgentRequest {
  return frame.type === 'req' && frame.method === 'agent';
}

export function isConnectParams(value: unknown): value is ConnectParams {
  if (!isRecord(value)) return false;

  if (!isNumber(value.minProtocol) || !isNumber(value.maxProtocol)) return false;
  if (!isRecord(value.client)) return false;
  if (!isString(value.client.id)) return false;
  if (!isString(value.client.version)) return false;
  if (!isString(value.client.platform)) return false;
  if (!isString(value.client.mode)) return false;
  if (!isString(value.role)) return false;
  if (!isStringArray(value.scopes)) return false;

  return true;
}

export function isAgentParams(value: unknown): value is AgentParams {
  if (!isRecord(value)) return false;
  return isString(value.input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
