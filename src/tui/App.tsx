import React, { useState, useEffect } from 'react';
import { Box, useApp } from 'ink';
import { Header } from './components/Header.js';
import { ChatLog } from './components/ChatLog.js';
import { StatusBar } from './components/StatusBar.js';
import { InputBar } from './components/InputBar.js';
import { type MessageType } from './components/MessageItem.js';
import { runPrompt } from '../runtime/chat.js';
import { listSessionKeys, resolveConfiguredModelLabel } from './utils.js';
import crypto from 'crypto';

export type AppProps = {
  initialAgentId: string;
  initialSessionId: string;
  initialProfile?: string;
  gatewayUrl: string;
  gatewayToken?: string;
};

export function App({
  initialAgentId,
  initialSessionId,
  initialProfile,
  gatewayUrl,
  gatewayToken,
}: AppProps) {
  const { exit } = useApp();
  
  const [agentId, setAgentId] = useState(initialAgentId);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [profile, setProfile] = useState(initialProfile || 'default');
  const [modelLabel, setModelLabel] = useState('loading...');
  const [tokens, setTokens] = useState<{ prompt: number; completion: number; total: number } | undefined>();
  
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [runState, setRunState] = useState<'idle' | 'running' | 'error'>('idle');
  const [currentTool, setCurrentTool] = useState<string | undefined>();

  useEffect(() => {
    resolveConfiguredModelLabel().then(setModelLabel);
  }, []);

  const addMessage = (msg: MessageType) => setMessages(prev => [...prev, msg]);
  const appendToLastMessage = (delta: string) => {
    setMessages(prev => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.role === 'assistant') {
        last.content += delta;
      }
      return copy;
    });
  };
  const updateToolMessage = (toolName: string, status: 'running' | 'done' | 'error', output?: string) => {
    setMessages(prev => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'tool' && copy[i].toolName === toolName) {
           copy[i].toolStatus = status;
           if (output) copy[i].content = output;
           break;
        }
      }
      return copy;
    });
  };

  const handleLocalCommand = async (input: string) => {
    const trimmed = input.trim();
    const parts = trimmed.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    if (cmd === 'exit' || cmd === 'quit') {
      exit();
      return true;
    }
    if (cmd === 'clear') {
      setMessages([]);
      return true;
    }
    if (cmd === 'agent') {
      if (arg) setAgentId(arg);
      addMessage({ id: crypto.randomUUID(), role: 'system', content: `Agent set to ${arg || agentId}` });
      return true;
    }
    if (cmd === 'session') {
      if (arg) setSessionId(arg);
      addMessage({ id: crypto.randomUUID(), role: 'system', content: `Session set to ${arg || sessionId}` });
      return true;
    }
    if (cmd === 'resume') {
      const sessions = await listSessionKeys(agentId);
      if (sessions.length === 0) {
        addMessage({ id: crypto.randomUUID(), role: 'system', content: `No saved sessions found for agent "${agentId}".` });
        return true;
      }
      if (!arg) {
        const text = 'Recent sessions:\n' + sessions.slice(0, 10).map((k, i) => `  ${i + 1}. ${k}${k === sessionId ? ' *' : ''}`).join('\n');
        addMessage({ id: crypto.randomUUID(), role: 'system', content: text });
        return true;
      }
      if (/^\d+$/.test(arg)) {
        const index = Number(arg);
        if (index > 0 && index <= sessions.length) {
          setSessionId(sessions[index - 1]);
          addMessage({ id: crypto.randomUUID(), role: 'system', content: `Session set to ${sessions[index - 1]}` });
        }
        return true;
      }
      setSessionId(arg);
      addMessage({ id: crypto.randomUUID(), role: 'system', content: `Session set to ${arg}` });
      return true;
    }
    return false;
  };

  const handleSubmit = async (text: string) => {
    if (text.startsWith('/')) {
      const handled = await handleLocalCommand(text);
      if (handled) return;
    }

    addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
    
    // placeholder for assistant reply
    const replyId = crypto.randomUUID();
    addMessage({ id: replyId, role: 'assistant', content: '' });

    setRunState('running');
    setCurrentTool(undefined);
    setTokens(undefined);

    try {
      const finalSummary = await runPrompt(text, {
        agentId,
        sessionId,
        profile: initialProfile,
        gatewayUrl,
        gatewayToken,
        onStream: (delta) => {
          appendToLastMessage(delta);
        },
        onTool: (payload) => {
           if (payload.phase === 'start') {
             setCurrentTool(payload.toolName);
             addMessage({
               id: crypto.randomUUID(),
               role: 'tool',
               content: '',
               toolName: payload.toolName,
               toolStatus: 'running'
             });
           } else if (payload.phase === 'end') {
             setCurrentTool(undefined);
             updateToolMessage(payload.toolName, 'done', typeof payload.output === 'string' ? payload.output : JSON.stringify(payload.output));
           } else if (payload.phase === 'error') {
             setCurrentTool(undefined);
             updateToolMessage(payload.toolName, 'error', payload.error?.message);
           }
        },
        onUsage: (payload) => {
          setTokens({
            prompt: payload.promptTokens,
            completion: payload.completionTokens,
            total: payload.totalTokens
          });
        }
      });

      // Always sync the final summary to the UI to handle fast streams
      setMessages(prev => {
         const copy = [...prev];
         const last = copy[copy.length - 1];
         if (last && last.id === replyId) {
            last.content = finalSummary;
         }
         return copy;
      });
      setRunState('idle');

      // Refresh model label in case it was changed via /model
      const newLabel = await resolveConfiguredModelLabel();
      setModelLabel(newLabel);

    } catch (err: any) {
      setRunState('error');
      setCurrentTool(undefined);
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${err?.message || 'Unknown error'}`
      });
    }
  };

  // Keep rendering at most last 50 messages to avoid breaking terminal size limits too badly if very long
  const visibleMessages = messages.slice(-50);

  return (
    <Box flexDirection="column" minHeight={10} width="100%">
      <Header gatewayUrl={gatewayUrl} agentId={agentId} sessionId={sessionId} />
      <ChatLog messages={visibleMessages} />
      <StatusBar
        agentId={agentId}
        sessionId={sessionId}
        runState={runState}
        currentToolName={currentTool}
        modelLabel={modelLabel}
        tokens={tokens}
      />
      <InputBar onSubmit={handleSubmit} isDisabled={runState === 'running'} />
    </Box>
  );
}
