import { Message, Tool, ToolCall } from '../types.js';

export interface LLMResponse {
  content: string | null;
  toolCalls?: ToolCall[];
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
