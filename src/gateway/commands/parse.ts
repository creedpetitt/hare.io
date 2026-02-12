import type { ParsedGatewayCommand } from './types.js';

export function parseStandaloneSlashCommand(input: string): ParsedGatewayCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const raw = trimmed.slice(1).trim();
  if (!raw) return { name: 'help', args: [], rawArgs: '' };

  const firstSpace = raw.indexOf(' ');
  const namePart = firstSpace === -1 ? raw : raw.slice(0, firstSpace);
  const rawArgs = firstSpace === -1 ? '' : raw.slice(firstSpace + 1).trim();
  const args = rawArgs ? rawArgs.split(/\s+/g) : [];

  return {
    name: namePart.replace(/:$/, '').toLowerCase(),
    args,
    rawArgs,
  };
}
