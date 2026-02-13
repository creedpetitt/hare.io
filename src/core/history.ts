import type { Message } from './types.js';

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

    clearDanglingAssistantToolCalls();
    sanitized.push(message);
    pendingToolCalls.clear();
    pendingAssistantIndex = undefined;
  }

  clearDanglingAssistantToolCalls();
  return {
    messages: sanitized,
    droppedInvalidTools,
    normalizedAssistantContent,
    removedDanglingToolCalls,
  };
}
