import type { Message, ToolCall } from './types.js';

export type SanitizedHistory = {
  messages: Message[];
  droppedInvalidTools: number;
  normalizedAssistantContent: number;
  removedDanglingToolCalls: number;
};

export function sanitizeHistory(messages: Message[]): SanitizedHistory {
  const sanitized: Message[] = [];
  let droppedInvalidTools = 0;
  let normalizedAssistantContent = 0;
  let removedDanglingToolCalls = 0;
  let pendingToolCalls = new Set<string>();
  let pendingAssistantIndex: number | undefined;

  const clearDanglingAssistantToolCalls = () => {
    if (!pendingToolCalls.size) return;
    if (pendingAssistantIndex === undefined) return;
    const assistant = sanitized[pendingAssistantIndex];
    if (!assistant || assistant.role !== 'assistant') return;
    if (!assistant.tool_calls?.length) return;
    sanitized[pendingAssistantIndex] = {
      ...assistant,
      tool_calls: undefined,
    };
    removedDanglingToolCalls += 1;
  };

  for (const originalMessage of messages) {
    let message = originalMessage;
    
    // Normalize null content from some providers
    if (message.role === 'assistant' && message.content === null) {
      message = {
        ...message,
        content: '',
      };
      normalizedAssistantContent += 1;
    }

    if (message.role === 'assistant') {
      clearDanglingAssistantToolCalls();
      sanitized.push(message);
      pendingToolCalls = new Set(
        (message.tool_calls ?? [])
          .map((toolCall) => toolCall.id)
          .filter((id): id is string => Boolean(id))
      );
      pendingAssistantIndex = pendingToolCalls.size > 0 ? sanitized.length - 1 : undefined;
      continue;
    }

    if (message.role === 'tool') {
      const toolCallId = message.tool_call_id;
      if (!toolCallId || !pendingToolCalls.has(toolCallId)) {
        droppedInvalidTools += 1;
        continue;
      }
      sanitized.push(message);
      pendingToolCalls.delete(toolCallId);
      if (pendingToolCalls.size === 0) {
        pendingAssistantIndex = undefined;
      }
      continue;
    }

    // For user or system messages, clear any pending state
    clearDanglingAssistantToolCalls();
    sanitized.push(message);
    pendingToolCalls.clear();
    pendingAssistantIndex = undefined;
  }

  // Final check at the end of history
  clearDanglingAssistantToolCalls();
  
  return {
    messages: sanitized,
    droppedInvalidTools,
    normalizedAssistantContent,
    removedDanglingToolCalls,
  };
}

export function estimateHistoryTokens(history: Message[]): number {
  let totalChars = 0;
  for (const msg of history) {
    totalChars += (msg.content || '').length;
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        totalChars += tc.function.name.length + tc.function.arguments.length;
      }
    }
  }
  // Rough industry standard: 4 characters per token
  return Math.ceil(totalChars / 4);
}

export function formatHistoryEntry(sessionId: string, summary: string): string {
  const timestamp = new Date().toISOString();
  return [`## ${timestamp} session:${sessionId}`, 'Summary:', summary].join('\n');
}

export function serializeToolResultForHistory(result: any): string {
  const serialized = JSON.stringify({
    toolName: result.toolName,
    success: result.success,
    result: result.result,
    error: result.error ?? null,
  });

  const MAX_HISTORY_RESULT_CHARS = 4000;
  if (serialized.length > MAX_HISTORY_RESULT_CHARS) {
    return JSON.stringify({
      toolName: result.toolName,
      success: result.success,
      result: result.result.slice(0, MAX_HISTORY_RESULT_CHARS) + `... [TRUNCATED ${result.result.length - MAX_HISTORY_RESULT_CHARS} CHARS]`,
      error: result.error ?? null,
      note: "Result truncated in history to save context tokens."
    });
  }

  return serialized;
}
