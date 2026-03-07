import React from 'react';
import { Box, Text } from 'ink';

export type StatusBarProps = {
  agentId: string;
  sessionId: string;
  runState: 'idle' | 'running' | 'error';
  currentToolName?: string;
  modelLabel: string;
};

export function StatusBar({
  agentId,
  sessionId,
  runState,
  currentToolName,
  modelLabel,
}: StatusBarProps) {
  const isRunning = runState === 'running';
  const columns = process.stdout.columns || 80;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="#888888">session agent:{agentId}:{sessionId}</Text>
      </Box>
      <Box>
        <Text color="#888888">gateway connected | </Text>
        {isRunning ? (
          <Text color="yellow">{currentToolName ? `running tool: ${currentToolName}` : 'streaming...'}</Text>
        ) : runState === 'error' ? (
          <Text color="red">error</Text>
        ) : (
          <Text color="#888888">idle</Text>
        )}
      </Box>
      <Box>
        <Text color="#888888">
          agent {agentId} | session {sessionId} (hare-tui) | {modelLabel}
        </Text>
      </Box>
      <Box>
        <Text color="#888888">{"─".repeat(columns)}</Text>
      </Box>
    </Box>
  );
}
