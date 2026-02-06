import OpenAI from 'openai';
import { LLMProvider } from './LLMProvider.js';
import { Message } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(systemPrompt: string, history: Message[]): Promise<string> {
    const openAIMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: openAIMessages as any,
    });

    return response.choices[0]?.message?.content || 'No response.';
  }
}
