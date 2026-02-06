import { z } from 'zod';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role;
  content: string;
  name?: string;
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

export interface AgentConfig {
  agentId: string;
  workspacePath: string;
  model: string;
  debug: boolean;
  compactionThreshold: number;
  compactionKeep: number;
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
}

export interface Tool<T extends z.ZodObject<any> = z.ZodObject<any>> {
  name: string;
  description: string;
  schema: T;
  execute: (args: z.infer<T>, context: AgentContext) => Promise<ToolResult>;
}
