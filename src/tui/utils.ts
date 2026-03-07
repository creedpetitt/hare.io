import fs from 'fs/promises';
import path from 'path';
import { CONFIG_DIR, loadConfig } from '@core/config.js';

export async function resolveConfiguredModelLabel(): Promise<string> {
  const config = await loadConfig();
  const provider = config.defaults?.provider;
  if (!provider) return 'unconfigured';
  const model = config.providers?.[provider]?.model;
  return `${provider}/${model || 'default'}`;
}

export async function listSessionKeys(agentId: string): Promise<string[]> {
  const sessionsDir = path.join(CONFIG_DIR, 'agents', agentId, 'sessions');
  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.jsonl'));

  const withMtime: Array<{ key: string; mtimeMs: number }> = [];
  for (const file of files) {
    const filePath = path.join(sessionsDir, file);
    try {
      const stat = await fs.stat(filePath);
      withMtime.push({ key: file.slice(0, -6), mtimeMs: stat.mtimeMs });
    } catch {
      withMtime.push({ key: file.slice(0, -6), mtimeMs: 0 });
    }
  }

  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withMtime.map((item) => item.key);
}

export function resolveContextWindow(modelLabel: string): number {
  const lower = modelLabel.toLowerCase();
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo') || lower.includes('o1')) return 128_000;
  if (lower.includes('claude-3-5') || lower.includes('claude-3-opus')) return 200_000;
  if (lower.includes('gemini-1.5-pro')) return 2_000_000;
  if (lower.includes('gemini-1.5-flash')) return 1_000_000;
  return 0;
}
