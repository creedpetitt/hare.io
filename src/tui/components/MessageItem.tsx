import React from 'react';
import { Box, Text } from 'ink';

export type MessageType = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolName?: string;
  toolStatus?: 'running' | 'done' | 'error';
};

export function MessageItem({ message }: { message: MessageType }) {
  if (message.role === 'system') {
    return (
      <Box marginBottom={1}>
        <Text color="#888888">{message.content}</Text>
      </Box>
    );
  }

  if (message.role === 'user') {
    return (
      <Box marginBottom={1} width="100%" backgroundColor="#2A2A2A">
        <Text>{message.content}</Text>
      </Box>
    );
  }

  if (message.role === 'tool') {
    const isRunning = message.toolStatus === 'running';
    const statusStr = isRunning ? 'running...' : message.toolStatus;
    const content = isRunning ? '...' : (message.content || '');
    const truncated = content.length > 250 ? content.slice(0, 250) + '...' : content;
    
    return (
      <Box marginBottom={1} flexDirection="column">
        <Text color="#A0A0A0">{`{"name": "${message.toolName}", "status": "${statusStr}", "output": ${JSON.stringify(truncated)}}`}</Text>
      </Box>
    );
  }

  // assistant
  return (
    <Box marginBottom={1} flexDirection="column">
      {message.content === '' ? (
        <Text color="#888888">Thinking...</Text>
      ) : (
        <Text>{message.content}</Text>
      )}
    </Box>
  );
}
