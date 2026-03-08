import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { SkillDefinition } from '../types.js';

type SkillSource = 'workspace' | 'builtin';

export type SkillCatalogEntry = SkillDefinition & {
  source: SkillSource;
  available: boolean;
  missingRequires: string[];
  metadata?: Record<string, unknown>;
};

type Frontmatter = {
  name?: string;
  description?: string;
  metadata?: string;
  always?: string;
};

type ParsedSkill = {
  name: string;
  description: string;
  body: string;
  metadata: Record<string, unknown>;
  always: boolean;
};

type SkillCandidate = {
  name: string;
  source: SkillSource;
  location: string;
};

const DEFAULT_MAX_CHARS_PER_SKILL = 4_000;

export class SkillsLoader {
  private workspaceDir: string;
  private builtinDirs: string[];

  constructor(workspaceDir: string, builtinDirs?: string[]) {
    this.workspaceDir = workspaceDir;
    this.builtinDirs = (builtinDirs && builtinDirs.length > 0 ? builtinDirs : resolveBuiltinSkillDirs())
      .map((dir) => path.resolve(dir));
  }

  async listSkills(options?: {
    includeUnavailable?: boolean;
    includeContent?: boolean;
    maxCharsPerSkill?: number;
  }): Promise<SkillCatalogEntry[]> {
    const includeUnavailable = options?.includeUnavailable ?? true;
    const includeContent = options?.includeContent ?? true;
    const maxCharsPerSkill = options?.maxCharsPerSkill ?? DEFAULT_MAX_CHARS_PER_SKILL;
    const candidates = await this.discoverCandidates();
    const result: SkillCatalogEntry[] = [];

    for (const candidate of candidates) {
      const raw = await readFileSafe(candidate.location);
      if (!raw) continue;
      const parsed = parseSkill(raw, candidate.name);
      const { available, missingRequires } = evaluateRequirements(parsed.metadata);
      if (!available && !includeUnavailable) continue;
      result.push({
        name: parsed.name,
        description: parsed.description,
        content: includeContent ? truncateSkill(parsed.body, maxCharsPerSkill) : '',
        location: candidate.location,
        source: candidate.source,
        available,
        missingRequires,
        metadata: parsed.metadata,
        always: parsed.always,
      });
    }

    return result;
  }

  async loadSkill(name: string, maxCharsPerSkill: number = DEFAULT_MAX_CHARS_PER_SKILL): Promise<SkillCatalogEntry | null> {
    const all = await this.listSkills({
      includeUnavailable: true,
      includeContent: true,
      maxCharsPerSkill,
    });
    const match = all.find((skill) => skill.name.toLowerCase() === name.toLowerCase());
    return match ?? null;
  }

  async loadSkillsForContext(skillNames: string[], maxCharsPerSkill: number): Promise<SkillDefinition[]> {
    if (skillNames.length === 0) return [];
    const requested = new Set(skillNames.map((name) => name.toLowerCase()));
    const all = await this.listSkills({
      includeUnavailable: false,
      includeContent: true,
      maxCharsPerSkill,
    });
    return all.filter((skill) => requested.has(skill.name.toLowerCase()));
  }

  private async discoverCandidates(): Promise<SkillCandidate[]> {
    const byName = new Map<string, SkillCandidate>();
    const workspaceSkillsDir = path.join(this.workspaceDir, 'skills');
    await collectSkillDirs(workspaceSkillsDir, 'workspace', byName, true);
    for (const builtinDir of this.builtinDirs) {
      await collectSkillDirs(builtinDir, 'builtin', byName, false);
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}

async function collectSkillDirs(
  baseDir: string,
  source: SkillSource,
  byName: Map<string, SkillCandidate>,
  overwrite: boolean
): Promise<void> {
  let entries: Array<import('fs').Dirent> = [];
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(baseDir, entry.name, 'SKILL.md');
    try {
      await fs.access(skillPath);
    } catch {
      continue;
    }
    const key = entry.name.toLowerCase();
    if (!overwrite && byName.has(key)) continue;
    byName.set(key, {
      name: entry.name,
      source,
      location: skillPath,
    });
  }
}

function parseSkill(raw: string, fallbackName: string): ParsedSkill {
  const { frontmatter, body } = parseFrontmatter(raw);
  const metadata = parseMetadata(frontmatter.metadata);
  const parsedName = frontmatter.name || fallbackName;
  const description = frontmatter.description || firstNonEmptyLine(body) || parsedName;
  const alwaysFlag = parseBoolean(frontmatter.always);
  const metadataAlways = Boolean(getMetadataRoot(metadata).always);
  return {
    name: parsedName,
    description,
    body: body.trim(),
    metadata,
    always: alwaysFlag || metadataAlways,
  };
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const block = match[1];
  const body = raw.slice(match[0].length);
  const frontmatter: Frontmatter = {};
  
  // Use a more robust regex for key-value pairs
  const lines = block.split('\n');
  for (const line of lines) {
    const pairMatch = line.match(/^([a-z0-9_-]+)\s*:\s*(.*)$/i);
    if (!pairMatch) continue;
    
    const key = pairMatch[1].toLowerCase();
    const value = pairMatch[2].trim().replace(/^['"]|['"]$/g, '');
    
    if (key === 'name') frontmatter.name = value;
    else if (key === 'description') frontmatter.description = value;
    else if (key === 'metadata') frontmatter.metadata = value;
    else if (key === 'always') frontmatter.always = value;
  }
  return { frontmatter, body };
}

function parseMetadata(raw?: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function evaluateRequirements(metadata: Record<string, unknown>): {
  available: boolean;
  missingRequires: string[];
} {
  const root = getMetadataRoot(metadata);
  const requires = (root.requires ?? {}) as Record<string, unknown>;
  const missing: string[] = [];

  const bins = Array.isArray(requires.bins) ? requires.bins : [];
  for (const bin of bins) {
    const binName = String(bin);
    if (!isBinaryAvailable(binName)) {
      missing.push(`bin:${binName}`);
    }
  }

  const envVars = Array.isArray(requires.env) ? requires.env : [];
  for (const envVar of envVars) {
    const key = String(envVar);
    if (!process.env[key]) {
      missing.push(`env:${key}`);
    }
  }

  return { available: missing.length === 0, missingRequires: missing };
}

function getMetadataRoot(metadata: Record<string, unknown>): Record<string, unknown> {
  const openclaw = metadata.openclaw;
  if (openclaw && typeof openclaw === 'object') return openclaw as Record<string, unknown>;
  const nanobot = metadata.nanobot;
  if (nanobot && typeof nanobot === 'object') return nanobot as Record<string, unknown>;
  return metadata;
}

function isBinaryAvailable(bin: string): boolean {
  if (!bin) return false;
  const result = spawnSync('which', [bin], { stdio: 'ignore' });
  return result.status === 0;
}

function parseBoolean(raw?: string): boolean {
  if (!raw) return false;
  const lower = raw.trim().toLowerCase();
  return lower === 'true' || lower === 'yes' || lower === '1' || lower === 'on';
}

async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function firstNonEmptyLine(value: string): string | undefined {
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

function truncateSkill(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const truncated = content.slice(0, maxChars);
  return `${truncated}\n\n[TRUNCATED SKILL TO ${maxChars} CHARS]`;
}

function resolveBuiltinSkillDirs(): string[] {
  const env = process.env.HARE_BUILTIN_SKILLS_DIR || '';
  const envDirs = env
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...envDirs,
    path.resolve(currentFileDir, '../../skills'),
    path.resolve(currentFileDir, '../../../src/skills'),
  ];

  const unique = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    unique.add(candidate);
  }
  return Array.from(unique);
}
