import { Agent } from '../../core/Agent.js';
import { loadConfig, AppConfig } from '../../core/config.js';
import { getConfiguredLLM } from '../../core/llm/getLLM.js';
import type { ProviderId } from '../../core/config.js';

type ChannelAgentOptions = {
  agentId?: string;
  sessionId?: string;
  profile?: string;
  channel?: string;
  chatType?: 'direct' | 'group';
  peerId?: string;
};

export function resolveRoute(config: AppConfig, options: ChannelAgentOptions): string {
  if (options.agentId) return options.agentId;
  
  if (config.bindings && options.channel) {
    // Exact match first (peerId is most specific)
    let match = config.bindings.find(b => 
      b.channel === options.channel && 
      b.peerId === options.peerId &&
      (!b.chatType || b.chatType === options.chatType)
    );
    
    // Channel + ChatType match
    if (!match && options.chatType) {
      match = config.bindings.find(b => 
        b.channel === options.channel && 
        b.chatType === options.chatType &&
        !b.peerId
      );
    }
    
    // Channel match (fallback)
    if (!match) {
      match = config.bindings.find(b => 
        b.channel === options.channel && 
        !b.chatType && 
        !b.peerId
      );
    }
    
    if (match) return match.agentId;
  }
  
  return 'main';
}

export async function runChannelAgent(input: string, options: ChannelAgentOptions = {}): Promise<string> {
  const config = await loadConfig();
  const agentId = resolveRoute(config, options);
  const sessionId = options.sessionId || agentId; // By default, isolated to agentId
  
  // Find per-agent config if it exists
  const agentConfig = config.agents?.list?.find(a => a.id === agentId);
  const profile = options.profile || agentConfig?.profile;
  const targetModel = agentConfig?.model;
  
  let llm, resolvedModel;
  
  if (targetModel) {
    // If agent specifies a model like "anthropic/claude-3-haiku" or "openai/gpt-4o"
    let providerId: string | undefined;
    let modelId = targetModel;
    if (targetModel.includes('/')) {
      const parts = targetModel.split('/');
      providerId = parts[0];
      modelId = parts.slice(1).join('/');
    }

    const resolved = await getConfiguredLLM({
      providerId: providerId as ProviderId,
      model: modelId,
      errorCode: 'unconfigured',
      errorMessage: `Missing API key for ${providerId || 'preferred provider'} configured for agent ${agentId}.`
    });
    llm = resolved.llm;
    resolvedModel = resolved.model;
  } else {
    // Default fallback
    const resolved = await getConfiguredLLM({
      errorCode: 'unconfigured',
      errorMessage: 'No API key configured for the preferred provider. Run `hare setup`.',
    });
    llm = resolved.llm;
    resolvedModel = resolved.model;
  }

  const agent = new Agent(sessionId, llm, agentId, {
    model: resolvedModel,
    debug: process.env.DEBUG === 'true',
    tools: profile ? { profile: profile as any } : undefined,
    maxToolIterations: config.agents?.defaults?.maxToolIterations,
    bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars,
    skills: config.agents?.defaults?.skills,
  }, {
    baseDir: agentConfig?.workspace, // Support workspace override via 5th param
  });
  
  return agent.run(input);
}
