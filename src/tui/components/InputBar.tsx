import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

type InputBarProps = {
  onSubmit: (text: string) => void;
  isDisabled?: boolean;
};

export function InputBar({ onSubmit, isDisabled }: InputBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (text: string) => {
    if (!text.trim() || isDisabled) return;
    onSubmit(text);
    setQuery('');
  };

  return (
    <Box borderStyle="round" borderColor={isDisabled ? "#888888" : "magenta"} paddingX={1} width="100%">
      {isDisabled ? (
        <Text color="#888888"> </Text>
      ) : (
        <Box width="100%">
          <TextInput
            value={query}
            onChange={setQuery}
            onSubmit={handleSubmit}
            placeholder=""
          />
        </Box>
      )}
    </Box>
  );
}
