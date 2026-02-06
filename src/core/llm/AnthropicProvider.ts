import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider } from './LLMProvider.js';
import { Message } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-3-opus-20240229') {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(systemPrompt: string, history: Message[]): Promise<string> {
    const anthropicMessages = history
      .filter((m) => m.role !== 'system') // Filter out system messages just in case
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.anthropic.messages.create({
      model: this.model,
      system: systemPrompt,
      messages: anthropicMessages,
      max_tokens: 4096,
    });

    // Anthropic returns an array of content blocks. We assume text for now.
    const textBlock = response.content.find((c) => c.type === 'text');
    return textBlock?.text || 'No response.';
  }
}
