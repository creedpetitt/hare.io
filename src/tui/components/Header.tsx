import React from 'react';
import { Box, Text } from 'ink';

export type HeaderProps = {
  gatewayUrl: string;
  agentId: string;
  sessionId: string;
};

export function Header({ gatewayUrl, agentId, sessionId }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="magenta">🐰 Hare 2026.x </Text>
        <Text color="#888888">- The extensible, Gateway-first autonomous agent.</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">
          hare tui - {gatewayUrl} - agent {agentId} - session {sessionId}
        </Text>
      </Box>
    </Box>
  );
}
