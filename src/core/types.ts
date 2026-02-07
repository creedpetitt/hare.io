import { z } from 'zod';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: Role;
  content: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  timestamp: number;
}

export interface BootstrapFiles {
  soul: string;
  agents: string;
  tools: string;
  identity: string;
  user: string;
  memory: string;
}

export type ToolProfile = 'minimal' | 'coding' | 'messaging' | 'full';

export interface ToolConfig {
  profile?: ToolProfile;
  allow?: string[];
  deny?: string[];
  policy?: ToolPolicyConfig;
}

export interface AgentConfig {
  agentId: string;
  workspacePath: string;
  model: string;
  debug: boolean;
  compactionThreshold: number;
  compactionKeep: number;
  tools?: ToolConfig;
  toolPolicy?: ToolPolicyConfig;
}

export interface AgentContext {
  config: AgentConfig;
  history: Message[];
  files: BootstrapFiles;
  summary: string;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  result: string;
  error?: ToolError;
}

export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ToolPolicy {
  timeoutMs?: number;
  maxResultBytes?: number;
}

export interface ToolPolicyConfig {
  defaults?: ToolPolicy;
  byTool?: Record<string, ToolPolicy>;
}

export interface Tool<T extends z.ZodObject<any>> {
  name: string;
  description: string;
  schema: T;
  execute: (args: z.infer<T>, context: AgentContext) => Promise<ToolResult>;
  getJsonSchema: () => object;
}
