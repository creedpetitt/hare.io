import { Agent } from '../../core/Agent.js';
import { loadConfig } from '../../core/config.js';
import { getConfiguredLLM } from '../../core/llm/getLLM.js';

type ChannelAgentOptions = {
  agentId?: string;
  sessionId?: string;
  profile?: string;
};

export async function runChannelAgent(input: string, options: ChannelAgentOptions = {}): Promise<string> {
  const agentId = options.agentId || 'main';
  const sessionId = options.sessionId || agentId;
  const { llm, model } = await getConfiguredLLM({
    errorCode: 'unconfigured',
    errorMessage: 'No API key configured for the preferred provider. Run `hare setup`.',
  });
  const config = await loadConfig();
  const agent = new Agent(sessionId, llm, agentId, {
    model,
    debug: process.env.DEBUG === 'true',
    tools: options.profile ? { profile: options.profile as any } : undefined,
    maxToolIterations: config.agents?.defaults?.maxToolIterations,
    bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars,
    skills: config.agents?.defaults?.skills,
  });
  return agent.run(input);
}
