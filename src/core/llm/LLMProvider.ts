import { Message, Tool, ToolCall } from '../types.js';

export interface LLMResponse {
  content: string | null;
  toolCalls?: ToolCall[];
}

/**
 * The Contract for any AI Provider.
 * The Agent class relies on THIS, not on specific SDKs.
 */
export interface LLMProvider {
  generate(systemPrompt: string, history: Message[], tools?: Tool[]): Promise<LLMResponse>;
}
