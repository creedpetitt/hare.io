import type { Message } from './types.js';

export type SanitizedHistory = {
  messages: Message[];
  droppedInvalidTools: number;
};

export function sanitizeHistory(messages: Message[]): SanitizedHistory {
  const sanitized: Message[] = [];
  let droppedInvalidTools = 0;
  let pendingToolCalls = new Set<string>();

  for (const message of messages) {
    if (message.role === 'assistant') {
      sanitized.push(message);
      pendingToolCalls = new Set(
        (message.tool_calls ?? [])
          .map((toolCall) => toolCall.id)
          .filter((id): id is string => Boolean(id))
      );
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
      continue;
    }

    sanitized.push(message);
    pendingToolCalls.clear();
  }

  return { messages: sanitized, droppedInvalidTools };
}
