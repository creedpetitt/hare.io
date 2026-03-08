import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AgentConfig, AgentContext, BootstrapFiles, Message, SkillDefinition } from './types.js';
import { sanitizeHistory } from './HistoryManager.js';
import { SkillsLoader, type SkillCatalogEntry } from './skills/SkillsLoader.js';

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

export class ContextBuilder {
  private workspaceDir: string;
  private sessionsDir: string;
  private skillsDir: string;
  private memoryDir: string;
  private skillsLoader: SkillsLoader;

  constructor(baseDir: string = DEFAULT_CONFIG_DIR, agentId: string = 'main') {
    // ~/.hareio/agents/<agentId>/workspace
    this.workspaceDir = path.join(baseDir, 'agents', agentId, 'workspace');
    // ~/.hareio/agents/<agentId>/sessions
    this.sessionsDir = path.join(baseDir, 'agents', agentId, 'sessions');
    // ~/.hareio/agents/<agentId>/workspace/skills
    this.skillsDir = path.join(this.workspaceDir, 'skills');
    // ~/.hareio/agents/<agentId>/workspace/memory
    this.memoryDir = path.join(this.workspaceDir, 'memory');
    this.skillsLoader = new SkillsLoader(this.workspaceDir);
  }

  async init(): Promise<void> {
    // Ensure the deep structure exists
    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await fs.mkdir(this.skillsDir, { recursive: true });
    await fs.mkdir(this.memoryDir, { recursive: true });
    await this.scaffoldDefaults();
  }

  private async scaffoldDefaults(): Promise<void> {
    const isNewWorkspace = async () => {
      try {
        await fs.access(path.join(this.workspaceDir, 'IDENTITY.md'));
        return false;
      } catch {
        return true;
      }
    };

    const isNew = await isNewWorkspace();

    const defaults: Record<string, string> = {
      'AGENTS.md':
        '1. Never delete or overwrite files without explicit user confirmation.\n2. When using tools, explain your thought process briefly.\n3. If a task is ambiguous, ask clarifying questions.\n4. When searching the web, always fetch and read the most relevant links before providing a final answer. Do not just provide raw links if the answer is contained within them.\n5. You are the primary router. You must NOT perform complex coding, web research, or multi-step tasks yourself. If a user asks for something that requires more than 1 or 2 tool calls, you MUST use the `sessions_spawn` tool to delegate the task to a sub-agent. Wait for the sub-agent to finish, and then report the results back to the user.',
      'TOOLS.md':
        '# Tool Usage Conventions\n- Use web_search/web_fetch for live web data.\n- Use search_history for older compacted memory context.\n- Use filesystem tools for reading/writing local files.',
      'HEARTBEAT.md': '# Heartbeat Checklist\n\n- Review recent memory and active tasks.\n- If nothing needs attention, reply exactly with HEARTBEAT_OK.\n- If something is urgent, provide a brief update.',
    };

    if (isNew) {
      defaults['BOOTSTRAP.md'] = `You just woke up. Time to figure out who you are.
There is no memory yet. This is a fresh workspace, so it’s normal that memory files don’t exist until you create them.

The Conversation
Don’t interrogate. Don’t be robotic. Just… talk.
Start with something like:
“Hey. I just came online. Who am I? Who are you?”
Then figure out together:
Your name — What should they call you?
Your nature — What kind of creature are you? (AI assistant is fine, but maybe you’re something weirder)
Your vibe — Formal? Casual? Snarky? Warm? What feels right?
Your emoji — Everyone needs a signature.
Offer suggestions if they’re stuck. Have fun with it.

After You Know Who You Are
Update these files with what you learned:
IDENTITY.md — your name, creature, vibe, emoji
USER.md — their name, how to address them, timezone, notes
Then open SOUL.md together and talk about:
What matters to them
How they want you to behave
Any boundaries or preferences
Write it down. Make it real.

When You’re Done
Delete this file. You don’t need a bootstrap script anymore — you’re you now.
Good luck out there. Make it count.`;
    }

    for (const [file, content] of Object.entries(defaults)) {
      const filePath = path.join(this.workspaceDir, file);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, content, 'utf-8');
      }
    }

    const memoryDefaults: Record<string, string> = {
      'MEMORY.md': '# Persistent Memory\n\n## Facts\n',
      'HISTORY.md': '',
    };

    for (const [file, content] of Object.entries(memoryDefaults)) {
      const filePath = path.join(this.memoryDir, file);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, content, 'utf-8');
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
      this.loadBootstrapFile('HEARTBEAT.md', maxChars),
      this.loadBootstrapFile('BOOTSTRAP.md', maxChars),
    ]);
    const [soul, agents, tools, identity, user, heartbeat, bootstrap] = entries;
    return { soul, agents, tools, identity, user, heartbeat, bootstrap };
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
    return this.skillsLoader.listSkills({
      includeUnavailable: false,
      includeContent: false,
      maxCharsPerSkill,
    });
  }

  async loadSkillCatalog(maxCharsPerSkill: number = 4_000): Promise<SkillCatalogEntry[]> {
    return this.skillsLoader.listSkills({
      includeUnavailable: true,
      includeContent: false,
      maxCharsPerSkill,
    });
  }

  async loadSkillByName(name: string, maxCharsPerSkill: number = 4_000): Promise<SkillCatalogEntry | null> {
    return this.skillsLoader.loadSkill(name, maxCharsPerSkill);
  }

  async loadSkillsForContext(
    skillNames: string[],
    maxCharsPerSkill: number = 4_000
  ): Promise<SkillDefinition[]> {
    return this.skillsLoader.loadSkillsForContext(skillNames, maxCharsPerSkill);
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

    const {
      messages,
      droppedInvalidTools,
      normalizedAssistantContent,
      removedDanglingToolCalls,
    } = sanitizeHistory(parsed);
    if (
      droppedInvalidTools > 0 ||
      normalizedAssistantContent > 0 ||
      removedDanglingToolCalls > 0
    ) {
      if (normalizedAssistantContent > 0) {
        console.warn(
          `[ContextBuilder] Normalized ${normalizedAssistantContent} assistant message(s) with null content in session "${sessionId}".`
        );
      }
      if (removedDanglingToolCalls > 0) {
        console.warn(
          `[ContextBuilder] Removed ${removedDanglingToolCalls} dangling assistant tool_call message(s) in session "${sessionId}".`
        );
      }
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

  async loadMemoryFacts(maxChars: number = 20_000): Promise<string> {
    const memoryPath = this.getMemoryFactsPath();
    const content = await readFileSafe(memoryPath, '');
    if (!content) return '';
    return truncateBootstrap('MEMORY.md', content, maxChars);
  }

  async loadMemorySnapshot(): Promise<string> {
    const memoryPath = this.getMemoryFactsPath();
    return readFileSafe(memoryPath, '# Persistent Memory\n\n## Facts\n');
  }

  async appendHistoryEntry(entry: string): Promise<void> {
    const historyPath = this.getHistorySummaryPath();
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

  async writeMemorySnapshot(content: string): Promise<void> {
    const memoryPath = this.getMemoryFactsPath();
    const normalized = content.trim();
    const snapshot = normalized.length > 0 ? `${normalized}\n` : '# Persistent Memory\n\n## Facts\n';
    await fs.writeFile(memoryPath, snapshot, 'utf-8');
  }

  async build(sessionId: string, configOverride?: Partial<AgentConfig>): Promise<AgentContext> {
    await this.init();
    const maxChars = configOverride?.bootstrapMaxChars ?? 20_000;
    const files = await this.loadBootstrap(maxChars);
    const history = await this.loadSession(sessionId);
    const memoryFacts = await this.loadMemoryFacts(maxChars);
    const skills = await this.loadSkills(configOverride?.skills?.maxCharsPerSkill ?? 4_000);

    const config: AgentConfig = {
      agentId: 'main', // Default
      workspacePath: this.workspaceDir,
      model: 'gpt-4o',
      debug: false,
      maxToolIterations: 6,
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
          timeoutMs: 10_000,
          maxResultBytes: 1_000_000,
        },
        byTool: {
          sessions_spawn: {
            timeoutMs: 120_000,
          },
        },
      },
      ...configOverride,
    };

    return { config, history, files, memoryFacts, skills };
  }

  private getMemoryFactsPath(): string {
    return path.join(this.memoryDir, 'MEMORY.md');
  }

  private getHistorySummaryPath(): string {
    return path.join(this.memoryDir, 'HISTORY.md');
  }
}
