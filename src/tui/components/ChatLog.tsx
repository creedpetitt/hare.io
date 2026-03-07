import React, { useRef, useEffect } from 'react';
import { Box } from 'ink';
import { MessageItem, type MessageType } from './MessageItem.js';

type ChatLogProps = {
  messages: MessageType[];
};

export function ChatLog({ messages }: ChatLogProps) {
  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} flexBasis={0} overflowY="hidden">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </Box>
  );
}
