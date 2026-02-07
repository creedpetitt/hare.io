import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AgentConfig, AgentContext, BootstrapFiles, Message } from './types.js';

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
  private configDir: string;
  private workspaceDir: string;
  private sessionsDir: string;

  constructor(baseDir: string = DEFAULT_CONFIG_DIR, agentId: string = 'main') {
    this.configDir = baseDir;
    // ~/.hareio/agents/<agentId>/workspace
    this.workspaceDir = path.join(baseDir, 'agents', agentId, 'workspace');
    // ~/.hareio/agents/<agentId>/sessions
    this.sessionsDir = path.join(baseDir, 'agents', agentId, 'sessions');
  }

  async init(): Promise<void> {
    // Ensure the deep structure exists
    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.mkdir(this.sessionsDir, { recursive: true });
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

  async loadSession(sessionId: string): Promise<Message[]> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    const content = await readFileSafe(sessionPath);
    if (!content) return [];

    return content
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
  }

  async loadSummary(sessionId: string): Promise<string> {
    const summaryPath = path.join(this.sessionsDir, `${sessionId}.summary.md`);
    return await readFileSafe(summaryPath, '');
  }

  async saveSummary(sessionId: string, summary: string): Promise<void> {
    const summaryPath = path.join(this.sessionsDir, `${sessionId}.summary.md`);
    await fs.writeFile(summaryPath, summary, 'utf-8');
  }

  async archiveMessages(
    sessionId: string,
    messagesToArchive: Message[],
    activeMessages: Message[]
  ): Promise<void> {
    const archivePath = path.join(this.sessionsDir, `${sessionId}.archive.jsonl`);
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);

    // 1. Append old messages to archive
    const archiveContent = messagesToArchive.map((m) => JSON.stringify(m)).join('\n') + '\n';
    await fs.appendFile(archivePath, archiveContent);

    // 2. Overwrite active session with only recent messages
    const activeContent = activeMessages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    await fs.writeFile(sessionPath, activeContent);
  }

  async appendMessage(sessionId: string, message: Message): Promise<void> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    await fs.appendFile(sessionPath, JSON.stringify(message) + '\n');
  }

  async appendMemory(content: string): Promise<void> {
    const memoryPath = path.join(this.workspaceDir, 'MEMORY.md');
    const timestamp = new Date().toISOString();
    await fs.appendFile(memoryPath, `- [${timestamp}] ${content}\n`);
  }

  async build(sessionId: string, configOverride?: Partial<AgentConfig>): Promise<AgentContext> {
    await this.init();
    const maxChars = configOverride?.bootstrapMaxChars ?? 20_000;
    const files = await this.loadBootstrap(maxChars);
    const history = await this.loadSession(sessionId);
    const summary = await this.loadSummary(sessionId);

    const config: AgentConfig = {
      agentId: 'main', // Default
      workspacePath: this.workspaceDir,
      model: 'gpt-4o',
      debug: false,
      compactionThreshold: 20,
      compactionKeep: 10,
      bootstrapMaxChars: maxChars,
      toolPolicy: {
        defaults: {
          timeoutMs: 30_000,
          maxResultBytes: 1_000_000,
        },
      },
      ...configOverride,
    };

    return { config, history, files, summary };
  }
}
