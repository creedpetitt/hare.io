import { Message } from '../types.js';

/**
 * The Contract for any AI Provider.
 * The Agent class relies on THIS, not on specific SDKs.
 */
export interface LLMProvider {
  generate(systemPrompt: string, history: Message[]): Promise<string>;
}
