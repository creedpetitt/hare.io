import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import { AgentContext, ToolResult } from '../core/types.js';
import { getConfiguredLLM } from '../core/llm/getLLM.js';
import fs from 'fs/promises';
import path from 'path';

const SessionsSpawnSchema = z.object({
  prompt: z.string().describe('The task or message for the sub-agent.'),
  sessionId: z.string().optional().describe('Optional session ID. If omitted, a new one is created.'),
  agentId: z.string().optional().describe('Optional agent ID to use. Defaults to "main".'),
  profile: z.string().optional().describe('Optional tool profile for the sub-agent.'),
  skills: z.array(z.string()).optional().describe('Optional list of skill names to force activate for the sub-agent.'),
});

export class SessionsSpawnTool extends BaseTool<typeof SessionsSpawnSchema> {
  name = 'sessions_spawn';
  description = 'Delegate a task to a sub-agent in a separate session. Returns the sub-agent\'s final response.';
  schema = SessionsSpawnSchema;

  async execute(
    { prompt, sessionId, agentId, profile, skills }: z.infer<typeof SessionsSpawnSchema>,
    context: AgentContext
  ): Promise<ToolResult> {
    try {
      // Dynamic import to break circular dependency with Agent -> ToolRegistry -> SessionsSpawnTool
      const { Agent } = await import('../core/Agent.js');
      const { llm, model } = await getConfiguredLLM();

      const targetSessionId = sessionId || `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const targetAgentId = agentId || context.config.agentId || 'main';
      
      const extractedSkills = skills || [];
      const lowerPrompt = prompt.toLowerCase();
      if (lowerPrompt.includes('web-research') && !extractedSkills.includes('web-research')) {
        extractedSkills.push('web-research');
      }
      if (lowerPrompt.includes('clean-code') && !extractedSkills.includes('clean-code')) {
        extractedSkills.push('clean-code');
      }

      const subAgent = new Agent(targetSessionId, llm, targetAgentId, {
        ...context.config,
        tools: profile ? { profile: profile as any } : {
          ...(context.config.tools || {}),
          deny: [...(context.config.tools?.deny || []), 'sessions_spawn']
        },
        model, // Use the configured model
      });

      const result = await subAgent.run(prompt, { forcedSkills: extractedSkills });

      return this.success(`[Session: ${targetSessionId}] ${result}`);
    } catch (e: any) {
      return this.error(`Failed to spawn session: ${e.message}`);
    }
  }
}

const SessionsListSchema = z.object({
  agentId: z.string().optional().describe('Optional agent ID to list sessions for. Defaults to current.'),
});

export class SessionsListTool extends BaseTool<typeof SessionsListSchema> {
  name = 'sessions_list';
  description = 'List existing sessions for an agent.';
  schema = SessionsListSchema;

  async execute(
    { agentId }: z.infer<typeof SessionsListSchema>,
    context: AgentContext
  ): Promise<ToolResult> {
    try {
      const targetAgentId = agentId || context.config.agentId || 'main';
      // Path logic matches ContextBuilder.ts
      const sessionsDir = path.join(path.dirname(context.config.workspacePath), 'sessions');
      
      const entries = await fs.readdir(sessionsDir, { withFileTypes: true });
      const sessions = entries
        .filter(e => e.isFile() && e.name.endsWith('.jsonl'))
        .map(e => e.name.replace('.jsonl', ''))
        .join('');

      return this.success(sessions || 'No sessions found.');
    } catch (e: any) {
      return this.error(`Failed to list sessions: ${e.message}`);
    }
  }
}
