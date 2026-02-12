import type { ProviderId } from '../../core/config.js';

export type ParsedGatewayCommand = {
  name: string;
  args: string[];
  rawArgs: string;
};

export type CommandContext = {
  agentId: string;
  sessionId: string;
  profile?: string;
};

export type ActiveModel = {
  provider: ProviderId;
  model: string;
};
