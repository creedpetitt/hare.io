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

export class ContextBuilder {
  private configDir: string;
  private workspaceDir: string;
  private sessionsDir: string;

  constructor(baseDir: string = DEFAULT_CONFIG_DIR) {
    this.configDir = baseDir;
    this.workspaceDir = path.join(baseDir, 'workspace');
    this.sessionsDir = path.join(baseDir, 'sessions');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  async loadBootstrap(): Promise<BootstrapFiles> {
    const [soul, agents, tools, identity, user] = await Promise.all([
      readFileSafe(path.join(this.workspaceDir, 'SOUL.md')),
      readFileSafe(path.join(this.workspaceDir, 'AGENTS.md')),
      readFileSafe(path.join(this.workspaceDir, 'TOOLS.md')),
      readFileSafe(path.join(this.workspaceDir, 'IDENTITY.md'), 'Name: Harebot\nVibe: Helpful CLI Assistant'),
      readFileSafe(path.join(this.workspaceDir, 'USER.md')),
    ]);
    return { soul, agents, tools, identity, user };
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
        } catch {
          return null;
        }
      })
      .filter((msg): msg is Message => msg !== null);
  }

  async appendMessage(sessionId: string, message: Message): Promise<void> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.jsonl`);
    await fs.appendFile(sessionPath, JSON.stringify(message) + '\n');
  }

  async build(sessionId: string, configOverride?: Partial<AgentConfig>): Promise<AgentContext> {
    await this.init();
    const files = await this.loadBootstrap();
    const history = await this.loadSession(sessionId);

    const config: AgentConfig = {
      workspacePath: this.workspaceDir,
      model: 'gpt-4o',
      debug: false,
      ...configOverride,
    };

    return { config, history, files };
  }
}
