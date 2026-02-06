import { LLMProvider } from '../llm/LLMProvider.js';
import { Message } from '../types.js';

export class Compactor {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async compact(messages: Message[], prevSummary: string = ''): Promise<string> {
    const systemPrompt = `You are a conversation summarizer. Your job is to condense the following conversation history into concise bullet points.

${prevSummary ? `Previous Summary:\n${prevSummary}\n\n` : ''}

Instructions:
- Focus on key facts, decisions, and user preferences
- Keep it brief and actionable
- Preserve important context that may be needed later
- Format as bullet points

Summarize the conversation below:`;

    const conversationText = messages
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');

    // Create a single message containing the conversation to summarize
    const summaryRequest: Message[] = [
      {
        role: 'user',
        content: conversationText,
        timestamp: Date.now(),
      },
    ];

    return await this.llm.generate(systemPrompt, summaryRequest);
  }
}
