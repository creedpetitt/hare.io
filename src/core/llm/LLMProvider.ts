import { Message, Tool, ToolCall } from '../types.js';

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  usage?: Usage;
}

export type StreamDeltaHandler = (delta: string) => void;

export type StreamOptions = {
  abortSignal?: AbortSignal;
};

export interface LLMProvider {
  generate(systemPrompt: string, history: Message[], tools?: Tool<any>[]): Promise<LLMResponse>;
  generateStream(
    systemPrompt: string,
    history: Message[],
    tools?: Tool<any>[],
    onDelta?: StreamDeltaHandler,
    options?: StreamOptions
  ): Promise<LLMResponse>;
}
