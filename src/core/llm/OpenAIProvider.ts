import OpenAI from 'openai';
import { LLMProvider, LLMResponse } from './LLMProvider.js';
import { Message, Tool } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(
    systemPrompt: string,
    history: Message[],
    tools?: Tool<any>[]
  ): Promise<LLMResponse> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => this.mapMessage(m)),
    ];

    const openAITools = tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.getJsonSchema() as any,
      },
    }));

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: messages as any,
      tools: openAITools?.length ? openAITools : undefined,
    });

    const choice = response.choices[0]?.message;

    return {
      content: choice?.content || null,
      toolCalls: choice?.tool_calls as any,
    };
  }

  private mapMessage(m: Message) {
    const msg: any = { role: m.role, content: m.content };
    if (m.name) msg.name = m.name;
    if (m.tool_calls) msg.tool_calls = m.tool_calls;
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
    return msg;
  }
}
