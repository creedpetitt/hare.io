import { LLMProvider } from '../llm/LLMProvider.js';
import { Message } from '../types.js';

export interface CompactionResult {
  summary: string;
  newFacts: string[];
}

export class Compactor {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async compact(messages: Message[], prevSummary: string = ''): Promise<CompactionResult> {
    const systemPrompt = `You are a memory manager. Your job is to:
1. Summarize the conversation history.
2. Extract new, permanent facts about the user or project.

${prevSummary ? `=== PREVIOUS SUMMARY ===\n${prevSummary}\n` : ''}

=== INSTRUCTIONS ===
- Output MUST be in the following specific format:
---SUMMARY---
<bullet points of the conversation summary>
---FACTS---
<bullet points of NEW facts to memorize (if any)>
<e.g. - User's name is Dave>
<e.g. - Project uses TypeScript>

- If no new facts are found, leave the ---FACTS--- section empty.
- Keep the summary concise.
`;

    const conversationText = messages
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');

    const summaryRequest: Message[] = [
      {
        role: 'user',
        content: conversationText,
        timestamp: Date.now(),
      },
    ];

    const response = await this.llm.generate(systemPrompt, summaryRequest);
    return this.parseResponse(response);
  }

  private parseResponse(text: string): CompactionResult {
    const summaryMarker = '---SUMMARY---';
    const factsMarker = '---FACTS---';

    let summary = '';
    let facts: string[] = [];

    const summaryIndex = text.indexOf(summaryMarker);
    const factsIndex = text.indexOf(factsMarker);

    if (summaryIndex !== -1 && factsIndex !== -1) {
      summary = text.substring(summaryIndex + summaryMarker.length, factsIndex).trim();
      const factsText = text.substring(factsIndex + factsMarker.length).trim();
      facts = factsText
        .split('\n')
        .map(line => line.replace(/^-\s*/, '').trim()) 
        .filter(line => line.length > 0);
    } else if (summaryIndex !== -1) {
      summary = text.substring(summaryIndex + summaryMarker.length).trim();
    } else {
      // Fallback: Assume everything is summary
      summary = text;
    }

    return { summary, newFacts: facts };
  }
}
