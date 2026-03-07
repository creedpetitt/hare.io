import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

type TuiOptions = {
  agentId: string;
  sessionId: string;
  profile?: string;
  gatewayUrl: string;
  gatewayToken?: string;
};

export async function startTui(options: TuiOptions): Promise<number> {
  const { waitUntilExit } = render(
    <App
      initialAgentId={options.agentId}
      initialSessionId={options.sessionId}
      initialProfile={options.profile}
      gatewayUrl={options.gatewayUrl}
      gatewayToken={options.gatewayToken}
    />
  );
  
  await waitUntilExit();
  return 0;
}
