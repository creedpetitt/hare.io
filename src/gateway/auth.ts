import { loadConfig } from '../core/config.js';

export async function getGatewayToken(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.gateway?.token;
}

export function validateToken(expected: string | undefined, provided: string | undefined): boolean {
  if (!expected) return false;
  return expected === provided;
}
