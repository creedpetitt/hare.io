import { LLMProvider, LLMResponse } from '../llm/LLMProvider.js';
import { Message } from '../types.js';

export interface CompactionResult {
  historyEntry: string;
  memoryUpdate: string;
}

export class Compactor {
  private llm: LLMProvider;

  constructor(llm: LLMProvider) {
    this.llm = llm;
  }

  async compact(
    messages: Message[],
    currentMemory: string,
    sessionId: string
  ): Promise<CompactionResult> {
    const systemPrompt = `You are a memory consolidation agent.

Return ONLY valid JSON with exactly two top-level keys:
- "history_entry": short paragraph summary of archived conversation details.
- "memory_update": full updated MEMORY.md content (not a diff).

Rules:
- Keep history_entry concise and useful for future grep/search.
- memory_update must remain valid markdown.
- Prefer durable user/project facts and remove stale contradictions.
- Do NOT include placeholders (None, N/A, Unknown).
- Do NOT include transient formatting requests or repetitive turn chatter.`;

    const conversationText = messages
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content ?? ''}`)
      .join('\n\n');
    const prompt = [
      `Session: ${sessionId}`,
      '',
      '=== Current MEMORY.md ===',
      currentMemory || '# Persistent Memory\n\n## Facts\n',
      '',
      '=== Archived Conversation ===',
      conversationText || '(empty)',
    ].join('\n');
    const request: Message[] = [
      {
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      },
    ];

    const response = await this.llm.generate(systemPrompt, request);
    return this.parseResponse(response, currentMemory);
  }

  private parseResponse(response: LLMResponse, currentMemory: string): CompactionResult {
    const raw = (response.content || '').trim();
    const parsed = safeParseJson(stripCodeFence(raw));
    const historyEntry = asString(parsed?.history_entry).trim() || raw;
    const memoryUpdate = asString(parsed?.memory_update).trim() || currentMemory;
    return { historyEntry, memoryUpdate };
  }
}

function stripCodeFence(value: string): string {
  if (!value.startsWith('```')) return value;
  const firstBreak = value.indexOf('\n');
  const withoutOpen = firstBreak === -1 ? value : value.slice(firstBreak + 1);
  const closeIndex = withoutOpen.lastIndexOf('```');
  return closeIndex === -1 ? withoutOpen.trim() : withoutOpen.slice(0, closeIndex).trim();
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
