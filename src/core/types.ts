import { z } from 'zod';

import { Usage } from './llm/LLMProvider.js';

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
  heartbeat: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  content: string;
  location: string;
  source?: 'workspace' | 'builtin';
  available?: boolean;
  missingRequires?: string[];
  metadata?: Record<string, unknown>;
  always?: boolean;
}

export interface SkillRuntimeConfig {
  autoActivate?: boolean;
  maxActive?: number;
  maxCharsPerSkill?: number;
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
  maxToolIterations?: number;
  compactionThreshold: number;
  compactionKeep: number;
  bootstrapMaxChars?: number;
  skills?: SkillRuntimeConfig;
  tools?: ToolConfig;
  toolPolicy?: ToolPolicyConfig;
}

export interface AgentContext {
  config: AgentConfig;
  history: Message[];
  files: BootstrapFiles;
  memoryFacts: string;
  skills: SkillDefinition[];
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  result: string;
  error?: ToolError;
}

export interface ToolExecutionObserver {
  onToolStart?: (runId: string, toolName: string, input: unknown) => void;
  onToolEnd?: (runId: string, toolName: string, output: ToolResult) => void;
  onToolError?: (runId: string, toolName: string, error: ToolError) => void;
}

export interface AssistantStreamObserver {
  onAssistantDelta?: (runId: string, delta: string, index: number) => void;
  onUsage?: (runId: string, usage: Usage) => void;
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
