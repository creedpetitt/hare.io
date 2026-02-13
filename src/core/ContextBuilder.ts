import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AgentConfig, AgentContext, BootstrapFiles, Message, SkillDefinition } from './types.js';
import { sanitizeHistory } from './history.js';
import { formatMemoryFile, mergeMemoryFacts, parseMemoryFacts } from './memory/memoryHygiene.js';

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.hareio');

async function readFileSafe(filePath: string, defaultValue = ''): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return defaultValue;
  }
}

function formatMissingMarker(name: string): string {
  return `[MISSING ${name}]`;
}

function truncateBootstrap(name: string, content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const truncated = content.slice(0, maxChars);
  return `${truncated}

[TRUNCATED ${name} TO ${maxChars} CHARS]`;
}

type SkillFrontmatter = {
  name?: string;
  description?: string;
};

export class ContextBuilder {
  private workspaceDir: string;
  private sessionsDir: string;
  private skillsDir: string;

  constructor(baseDir: string = DEFAULT_CONFIG_DIR, agentId: string = 'main') {
    // ~/.hareio/agents/<agentId>/workspace
    this.workspaceDir = path.join(baseDir, 'agents', agentId, 'workspace');
    // ~/.hareio/agents/<agentId>/sessions
    this.sessionsDir = path.join(baseDir, 'agents', agentId, 'sessions');
    // ~/.hareio/agents/<agentId>/workspace/skills
    this.skillsDir = path.join(this.workspaceDir, 'skills');
  }

  async init(): Promise<void> {
    // Ensure the deep structure exists
    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await fs.mkdir(this.skillsDir, { recursive: true });
    await this.scaffoldDefaults();
  }

  private async scaffoldDefaults(): Promise<void> {
    const defaults: Record<string, string> = {
      'SOUL.md':
        "You are Harebot, a helpful and precise AI assistant running locally on the user's machine. You value clarity and safety.",
      'AGENTS.md':
        '1. Never delete or overwrite files without explicit user confirmation.\n2. When using tools, explain your thought process briefly.\n3. If a task is ambiguous, ask clarifying questions.',
      'TOOLS.md':
        '# Tool Usage Conventions\n- Use the Browser tool for retrieving live web data.\n- Use the FileSystem tool for reading/writing local files.',
      'IDENTITY.md': 'Name: Harebot\nEmoji: 🐰\nVersion: 1.0.0',
      'USER.md': 'User: Admin\nPreferences: Concise answers.',
      'MEMORY.md': '# Persistent Memory\n',
    };

    for (const [file, content] of Object.entries(defaults)) {
      const filePath = path.join(this.workspaceDir, file);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, content, 'utf-8');
      }
    }

    const skillDefaults: Record<string, string> = {
      'web-research': `---
name: web-research
description: Search + fetch + summarize a topic.
---
Use this when the user asks for research or sources.
1. Run web_search for 3-5 results.
2. Fetch the top 1-2 results with web_fetch.
3. Summarize with short citations.`,
      'doc-writer': `---
name: doc-writer
description: Turn notes into a clean document.
---
Use this to turn bullet points into a structured doc.
1. Ask for missing sections if required.
2. Draft with headings, concise paragraphs.
3. End with next steps if appropriate.`,
      'release-notes': `---
name: release-notes
description: Summarize changes into release notes.
---
Use this when given commits or change lists.
1. Group changes by feature/fix/chore.
2. Call out breaking changes first.
3. Keep it short and readable.`,
      'code-review': `---
name: code-review
description: Review code for bugs, risks, and missing tests.
---
When reviewing:
1. List high-severity issues first.
2. Then medium/low.
3. Call out missing tests.
4. Be concrete with file refs.`,
      'security-review': `---
name: security-review
description: Security-focused code review.
---
When reviewing:
1. Look for auth, injection, and data exposure risks.
2. Flag insecure defaults.
3. Suggest minimal, safe fixes.`,
      'clean-code': `---
name: clean-code
description: Improve readability and maintainability.
---
When asked to clean up code:
1. Reduce complexity and duplication.
2. Improve naming and structure.
3. Keep behavior unchanged unless stated.`,
    };

    for (const [skillName, content] of Object.entries(skillDefaults)) {
      const skillDir = path.join(this.skillsDir, skillName);
      const skillPath = path.join(skillDir, 'SKILL.md');
      await fs.mkdir(skillDir, { recursive: true });
      try {
        await fs.access(skillPath);
      } catch {
        await fs.writeFile(skillPath, content, 'utf-8');
      }
    }
  }

  async loadBootstrap(maxChars: number = 20_000): Promise<BootstrapFiles> {
    const entries = await Promise.all([
      this.loadBootstrapFile('SOUL.md', maxChars),
      this.loadBootstrapFile('AGENTS.md', maxChars),
      this.loadBootstrapFile('TOOLS.md', maxChars),
      this.loadBootstrapFile('IDENTITY.md', maxChars),
      this.loadBootstrapFile('USER.md', maxChars),
      this.loadBootstrapFile('MEMORY.md', maxChars),
    ]);
    const [soul, agents, tools, identity, user, memory] = entries;
    return { soul, agents, tools, identity, user, memory };
  }

  private async loadBootstrapFile(name: string, maxChars: number): Promise<string> {
    const filePath = path.join(this.workspaceDir, name);
    try {
      await fs.access(filePath);
    } catch {
      return formatMissingMarker(name);
    }
    const content = await readFileSafe(filePath);
    return truncateBootstrap(name, content, maxChars);
  }

  async loadSkills(maxCharsPerSkill: number = 4_000): Promise<SkillDefinition[]> {
    const skills: SkillDefinition[] = [];
    let entries: Array<import('fs').Dirent> = [];
    try {
      entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
    } catch {
      return skills;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(this.skillsDir, entry.name);
      const skillPath = path.join(skillDir, 'SKILL.md');
      const raw = await readFileSafe(skillPath);
      if (!raw) continue;
      const { frontmatter, body } = parseFrontmatter(raw);
      const name = frontmatter.name || entry.name;
      const description =
        frontmatter.description || firstNonEmptyLine(body) || 'No description.';
      const content = truncateSkill(body, maxCharsPerSkill);
      skills.push({
        name,
        description,
        content,
        location: skillPath,
      });
    }

    return skills;
  }

  async loadSession(sessionId: string): Promise<Message[]> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    const content = await readFileSafe(sessionPath);
    if (!content) return [];

    const parsed = content
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        try {
          return JSON.parse(line) as Message;
        } catch (e) {
          console.error(`[ContextBuilder] Warning: Dropping corrupt log line: "${line}"`, e);
          return null;
        }
      })
      .filter((msg): msg is Message => msg !== null);

    const { messages, droppedInvalidTools } = sanitizeHistory(parsed);
    if (droppedInvalidTools > 0) {
      console.warn(
        `[ContextBuilder] Dropped ${droppedInvalidTools} orphan tool message(s) from session "${sessionId}".`
      );
      try {
        await this.rewriteSessionFile(sessionPath, messages);
      } catch (error) {
        console.warn(
          `[ContextBuilder] Could not rewrite sanitized session "${sessionId}" at ${sessionPath}.`,
          error
        );
      }
    }

    return messages;
  }

  async loadHistoryLog(sessionId: string, maxChars: number = 20_000): Promise<string> {
    const historyPath = this.getHistoryPath(sessionId);
    const content = await readFileSafe(historyPath, '');
    if (!content) return '';
    return truncateBootstrap(`${sessionId}.history.md`, content, maxChars);
  }

  async appendHistoryEntry(sessionId: string, entry: string): Promise<void> {
    const historyPath = this.getHistoryPath(sessionId);
    const existing = await readFileSafe(historyPath, '');
    const prefix = existing.trim().length > 0 ? '\n\n' : '';
    await fs.appendFile(historyPath, `${prefix}${entry.trim()}\n`, 'utf-8');
  }

  async replaceSession(sessionId: string, messages: Message[]): Promise<void> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    const content = messages.length > 0 ? messages.map((m) => JSON.stringify(m)).join('\n') + '\n' : '';
    await fs.writeFile(sessionPath, content, 'utf-8');
  }

  async appendMessage(sessionId: string, message: Message): Promise<void> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    await fs.appendFile(sessionPath, JSON.stringify(message) + '\n');
  }

  private async rewriteSessionFile(sessionPath: string, messages: Message[]): Promise<void> {
    const serialized =
      messages.length > 0 ? messages.map((m) => JSON.stringify(m)).join('\n') + '\n' : '';
    await fs.writeFile(sessionPath, serialized, 'utf-8');
  }

  async upsertMemoryFacts(facts: string[]): Promise<void> {
    if (facts.length === 0) return;
    const memoryPath = path.join(this.workspaceDir, 'MEMORY.md');
    const existing = await readFileSafe(memoryPath, '');
    const existingFacts = parseMemoryFacts(existing);
    const merged = mergeMemoryFacts(existingFacts, facts);
    await fs.writeFile(memoryPath, formatMemoryFile(merged), 'utf-8');
  }

  async build(sessionId: string, configOverride?: Partial<AgentConfig>): Promise<AgentContext> {
    await this.init();
    const maxChars = configOverride?.bootstrapMaxChars ?? 20_000;
    const files = await this.loadBootstrap(maxChars);
    const history = await this.loadSession(sessionId);
    const historyLog = await this.loadHistoryLog(sessionId, maxChars);
    const skills = await this.loadSkills(configOverride?.skills?.maxCharsPerSkill ?? 4_000);

    const config: AgentConfig = {
      agentId: 'main', // Default
      workspacePath: this.workspaceDir,
      model: 'gpt-4o',
      debug: false,
      compactionThreshold: 20,
      compactionKeep: 10,
      bootstrapMaxChars: maxChars,
      skills: {
        autoActivate: false,
        maxActive: 2,
        maxCharsPerSkill: 2_000,
      },
      toolPolicy: {
        defaults: {
          timeoutMs: 30_000,
          maxResultBytes: 1_000_000,
        },
      },
      ...configOverride,
    };

    return { config, history, files, historyLog, skills };
  }

  private getHistoryPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.history.md`);
  }
}

function parseFrontmatter(raw: string): { frontmatter: SkillFrontmatter; body: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, body: raw.trim() };
  }
  const end = raw.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: {}, body: raw.trim() };
  }
  const front = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const frontmatter: SkillFrontmatter = {};
  for (const line of front.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === 'name') frontmatter.name = value;
    if (key === 'description') frontmatter.description = value;
  }
  return { frontmatter, body };
}

function firstNonEmptyLine(content: string): string | undefined {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function truncateSkill(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const truncated = content.slice(0, maxChars);
  return `${truncated}

[TRUNCATED SKILL TO ${maxChars} CHARS]`;
}
