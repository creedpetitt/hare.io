import React from 'react';
import { Box, Text } from 'ink';
import { resolveContextWindow } from '../utils.js';

export type StatusBarProps = {
  agentId: string;
  sessionId: string;
  runState: 'idle' | 'running' | 'error';
  currentToolName?: string;
  modelLabel: string;
  tokens?: { prompt: number; completion: number; total: number };
};

export function StatusBar({
  agentId,
  sessionId,
  runState,
  currentToolName,
  modelLabel,
  tokens,
}: StatusBarProps) {
  const isRunning = runState === 'running';
  const columns = process.stdout.columns || 80;

  const contextWindow = resolveContextWindow(modelLabel);
  const contextUsage = tokens ? tokens.prompt : 0;
  const percentage = contextWindow > 0 ? Math.round((contextUsage / contextWindow) * 100) : 0;
  const limitStr = contextWindow > 0 ? `${contextWindow / 1000}k` : '?k';

  const tokenStr = tokens
    ? `tokens ${Math.round(tokens.prompt / 100) / 10}k/${limitStr} (${percentage}%)`
    : `tokens ?/${limitStr}`;

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
          agent {agentId} | session {sessionId} (hare-tui) | {modelLabel} | {tokenStr}
        </Text>
      </Box>
      <Box>
        <Text color="#888888">{"─".repeat(columns)}</Text>
      </Box>
    </Box>
  );
}
