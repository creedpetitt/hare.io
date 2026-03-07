import { loadConfig } from '@core/config.js';
import { GatewayClient } from '@gateway/client.js';
import type { ToolStreamEventPayload } from '@gateway/protocol.js';

export type RunPromptOptions = {
  agentId: string;
  sessionId?: string;
  profile?: string;
  gatewayUrl: string;
  gatewayToken?: string;
  onStream?: (delta: string) => void;
  onTool?: (payload: ToolStreamEventPayload) => void;
  abortSignal?: AbortSignal;
};

export async function runPrompt(prompt: string, options: RunPromptOptions): Promise<string> {
  const sessionId = options.sessionId || options.agentId;
  const config = await loadConfig();
  const token = options.gatewayToken || config.gateway?.token;
  if (!token) {
    throw new Error(
      'Gateway token missing. Run `hare setup` or set HARE_GATEWAY_TOKEN, then verify with `hare gateway status`.'
    );
  }

  const client = new GatewayClient({
    url: options.gatewayUrl,
    token,
    clientId: 'hare-cli',
    clientVersion: '0.0.0',
    clientPlatform: process.platform,
    clientMode: 'operator',
    scopes: ['operator.read', 'operator.write'],
    onStream: options.onStream,
    onTool: options.onTool,
  });

  try {
    return await client.runAgent({
      input: prompt,
      sessionId,
      agentId: options.agentId,
      profile: options.profile,
    }, { abortSignal: options.abortSignal });
  } catch (error: any) {
    if (error?.code === 'agent_cancelled') {
      const err: any = new Error('Agent run cancelled.');
      err.code = 'agent_cancelled';
      throw err;
    }
    if (isGatewayUnavailable(error)) {
      throw new Error(
        `Gateway unavailable at ${options.gatewayUrl}. Run \`hare gateway status\`, then \`hare gateway start\` (or \`hare gateway foreground\`).`
      );
    }
    throw error;
  }
}

function isGatewayUnavailable(error: any): boolean {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(code)) return true;
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('econnrefused') ||
    message.includes('connect ehostunreach') ||
    message.includes('connect enotfound') ||
    message.includes('timed out while connecting') ||
    message.includes('websocket was closed before the connection was established')
  );
}
