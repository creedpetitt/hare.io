import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse } from './LLMProvider.js';
import { Message, Tool, ToolCall } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-5-sonnet-20240620') {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(
    systemPrompt: string,
    history: Message[],
    tools?: Tool<any>[]
  ): Promise<LLMResponse> {
    const messages = history.map((m) => this.mapMessage(m));

    const anthropicTools = tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.getJsonSchema() as any,
    }));

    const response = await this.anthropic.messages.create({
      model: this.model,
      system: systemPrompt,
      max_tokens: 4096,
      messages: messages as any,
      tools: anthropicTools,
    });

    return this.parseResponse(response);
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
