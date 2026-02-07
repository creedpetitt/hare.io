import { z } from 'zod';

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
  idempotencyKey?: string;
};

export type PingRequest = {
  type: 'req';
  id: string;
  method: 'ping';
  params?: Record<string, never>;
  idempotencyKey?: string;
};

export type AgentParams = {
  input: string;
  sessionId?: string;
  agentId?: string;
  profile?: string;
};

export type CancelParams = {
  runId: string;
  reason?: string;
};

export type AgentRequest = {
  type: 'req';
  id: string;
  method: 'agent';
  params: AgentParams;
  idempotencyKey?: string;
};

export type CancelRequest = {
  type: 'req';
  id: string;
  method: 'cancel';
  params: CancelParams;
  idempotencyKey?: string;
};

export type GatewayRequest = ConnectRequest | PingRequest | AgentRequest | CancelRequest;

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
    }
  | {
      runId: string;
      status: 'cancelled';
      error: { code: string; message: string };
    };

export type AgentLifecyclePhase = 'start' | 'end' | 'error';

export type AgentLifecycleEventPayload = {
  runId: string;
  sessionId: string;
  agentId: string;
  phase: AgentLifecyclePhase;
  status?: 'ok' | 'error' | 'cancelled';
  queuedAt?: number;
  startedAt?: number;
  endedAt?: number;
  summary?: string;
  error?: { code: string; message: string };
};

export type AgentStreamEventPayload = {
  runId: string;
  delta: string;
  index: number;
};

export type ToolStreamEventPayload = {
  runId: string;
  toolName: string;
  phase: 'start' | 'end' | 'error';
  input?: unknown;
  output?: unknown;
  error?: { code: string; message: string };
};

export type CancelResponsePayload = {
  runId: string;
  status: 'cancelled' | 'not_found';
  reason?: string;
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

const ClientInfoSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    platform: z.string(),
    mode: z.string(),
    displayName: z.string().optional(),
    deviceFamily: z.string().optional(),
    modelIdentifier: z.string().optional(),
    instanceId: z.string().optional(),
  })
  .strict();

const ConnectAuthSchema = z
  .object({
    token: z.string().optional(),
    password: z.string().optional(),
    deviceToken: z.string().optional(),
  })
  .strict();

const DeviceIdentitySchema = z
  .object({
    id: z.string().optional(),
    publicKey: z.string().optional(),
    signature: z.string().optional(),
    signedAt: z.number().int().optional(),
    nonce: z.string().optional(),
  })
  .strict();

const ConnectParamsSchema = z
  .object({
    minProtocol: z.number().int(),
    maxProtocol: z.number().int(),
    client: ClientInfoSchema,
    role: z.enum(['operator', 'node']),
    scopes: z.array(z.string()),
    caps: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    permissions: z.record(z.boolean()).optional(),
    auth: ConnectAuthSchema.optional(),
    locale: z.string().optional(),
    userAgent: z.string().optional(),
    device: DeviceIdentitySchema.optional(),
  })
  .strict();

const AgentParamsSchema = z
  .object({
    input: z.string(),
    sessionId: z.string().optional(),
    agentId: z.string().optional(),
    profile: z.string().optional(),
  })
  .strict();

const CancelParamsSchema = z
  .object({
    runId: z.string(),
    reason: z.string().optional(),
  })
  .strict();

const ConnectRequestSchema = z
  .object({
    type: z.literal('req'),
    id: z.string(),
    method: z.literal('connect'),
    params: ConnectParamsSchema,
    idempotencyKey: z.string().optional(),
  })
  .strict();

const PingRequestSchema = z
  .object({
    type: z.literal('req'),
    id: z.string(),
    method: z.literal('ping'),
    params: z.record(z.never()).optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

const AgentRequestSchema = z
  .object({
    type: z.literal('req'),
    id: z.string(),
    method: z.literal('agent'),
    params: AgentParamsSchema,
    idempotencyKey: z.string().optional(),
  })
  .strict();

const CancelRequestSchema = z
  .object({
    type: z.literal('req'),
    id: z.string(),
    method: z.literal('cancel'),
    params: CancelParamsSchema,
    idempotencyKey: z.string().optional(),
  })
  .strict();

const GatewayRequestSchema = z.union([
  ConnectRequestSchema,
  PingRequestSchema,
  AgentRequestSchema,
  CancelRequestSchema,
]);

export type ParsedGatewayRequest = {
  ok: true;
  request: GatewayRequest;
};

export type ParsedGatewayRequestError = {
  ok: false;
  error: { code: string; message: string };
};

export function parseGatewayRequest(
  value: unknown
): ParsedGatewayRequest | ParsedGatewayRequestError {
  const result = GatewayRequestSchema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      error: { code: 'invalid_request', message: 'Request does not match schema.' },
    };
  }

  return { ok: true, request: result.data };
}
