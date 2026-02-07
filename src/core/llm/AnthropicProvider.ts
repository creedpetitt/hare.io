import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse, StreamDeltaHandler, StreamOptions } from './LLMProvider.js';
import { Message, Tool, ToolCall } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(
    systemPrompt: string,
    history: Message[],
    tools?: Tool<any>[]
  ): Promise<LLMResponse> {
    return this.generateStream(systemPrompt, history, tools);
  }

  async generateStream(
    systemPrompt: string,
    history: Message[],
    tools?: Tool<any>[],
    onDelta?: StreamDeltaHandler,
    options?: StreamOptions
  ): Promise<LLMResponse> {
    const messages = history.map((m) => this.mapMessage(m));

    const anthropicTools = tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.getJsonSchema() as any,
    }));

    if (!onDelta) {
      const response = await this.anthropic.messages.create({
        model: this.model,
        system: systemPrompt,
        max_tokens: 4096,
        messages: messages as any,
        tools: anthropicTools,
      });
      return this.parseResponse(response);
    }

    const stream = this.anthropic.messages.stream({
      model: this.model,
      system: systemPrompt,
      max_tokens: 4096,
      messages: messages as any,
      tools: anthropicTools,
    });

    let content = '';
    const toolCalls: ToolCall[] = [];

    stream.on('text', (textDelta) => {
      if (options?.abortSignal?.aborted) return;
      content += textDelta;
      onDelta(textDelta);
    });

    stream.on('contentBlock', (block: any) => {
      if (!block) return;
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      }
    });

    if (options?.abortSignal) {
      if (options.abortSignal.aborted) {
        stream.abort();
      } else {
        options.abortSignal.addEventListener('abort', () => stream.abort(), { once: true });
      }
    }

    try {
      await stream.done();
    } catch (error: any) {
      if (error?.name === 'APIUserAbortError') {
        const err: any = new Error('Stream aborted');
        err.code = 'agent_cancelled';
        throw err;
      }
      throw error;
    }

    return {
      content: content || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private mapMessage(m: Message) {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content || '' }],
      };
    }

    if (m.tool_calls) {
      return {
        role: 'assistant',
        content: m.tool_calls.map((tc) => ({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        })),
      };
    }

    return { role: m.role, content: m.content || '' };
  }

  private parseResponse(response: any): LLMResponse {
    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      }
    }

    return {
      content: text || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
