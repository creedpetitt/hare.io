type FactEntry = {
  text: string;
  normalized: string;
  key?: string;
};

const MEMORY_HEADER = '# Persistent Memory';
const FACTS_HEADER = '## Facts';

export function parseMemoryFacts(content: string): string[] {
  const facts: string[] = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!match) continue;
    facts.push(match[1]);
  }
  return facts;
}

export function mergeMemoryFacts(existingFacts: string[], incomingFacts: string[]): string[] {
  const merged: FactEntry[] = [];

  for (const fact of existingFacts) {
    const entry = normalizeFactEntry(fact);
    if (!entry) continue;
    upsertFactEntry(merged, entry);
  }

  for (const fact of incomingFacts) {
    const entry = normalizeFactEntry(fact);
    if (!entry) continue;
    upsertFactEntry(merged, entry);
  }

  return merged.map((entry) => entry.text);
}

export function formatMemoryFile(facts: string[]): string {
  const lines = [MEMORY_HEADER, '', FACTS_HEADER];
  if (facts.length > 0) {
    lines.push(...facts.map((fact) => `- ${fact}`));
  }
  return `${lines.join('\n')}\n`;
}

function upsertFactEntry(entries: FactEntry[], candidate: FactEntry): void {
  if (candidate.key) {
    const existingByKey = entries.findIndex((entry) => entry.key === candidate.key);
    if (existingByKey !== -1) {
      entries[existingByKey] = candidate;
      return;
    }
  }

  const existingByText = entries.findIndex((entry) => entry.normalized === candidate.normalized);
  if (existingByText !== -1) {
    return;
  }

  entries.push(candidate);
}

function normalizeFactEntry(raw: string): FactEntry | null {
  const withoutTimestamp = raw.replace(/^\[[^\]]+\]\s*/, '').trim();
  const text = withoutTimestamp.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const normalized = text.toLowerCase();
  const key = extractFactKey(text);
  return { text, normalized, key };
}

function extractFactKey(text: string): string | undefined {
  const idx = text.indexOf(':');
  if (idx <= 0 || idx > 80) return undefined;
  const rawKey = text.slice(0, idx).trim().toLowerCase();
  if (!rawKey) return undefined;
  if (!/^[a-z0-9 _-]+$/.test(rawKey)) return undefined;
  return rawKey;
}
