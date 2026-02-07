import { Agent } from '../core/Agent.js';
import { getConfiguredLLM } from '../core/llm/getLLM.js';
import { loadConfig } from '../core/config.js';
import { GatewayClient } from '../gateway/client.js';

export type RunPromptOptions = {
  agentId: string;
  profile?: string;
  local: boolean;
  gatewayUrl: string;
  gatewayToken?: string;
};

export async function runPrompt(prompt: string, options: RunPromptOptions): Promise<string> {
  if (options.local) {
    const { llm, model } = await getConfiguredLLM();
    const agent = new Agent('main', llm, options.agentId, {
      model,
      debug: process.env.DEBUG === 'true',
      tools: options.profile ? { profile: options.profile as any } : undefined,
    });
    return agent.run(prompt);
  }

  const config = await loadConfig();
  const token = options.gatewayToken || config.gateway?.token;
  if (!token) {
    throw new Error('Gateway token missing. Run `hare setup` or set HARE_GATEWAY_TOKEN.');
  }

  const client = new GatewayClient({
    url: options.gatewayUrl,
    token,
    clientId: 'hare-cli',
    clientVersion: '0.0.0',
    clientPlatform: process.platform,
    clientMode: 'operator',
    scopes: ['operator.read', 'operator.write'],
  });

  return client.runAgent({
    input: prompt,
    sessionId: options.agentId,
    agentId: options.agentId,
    profile: options.profile,
  });
}
