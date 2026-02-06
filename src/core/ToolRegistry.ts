import { Tool, ToolConfig, ToolProfile } from './types.js';
import { ReadFileTool, WriteFileTool, EditFileTool, ListFilesTool } from '../tools/fs.js';

export class ToolRegistry {
  private static tools = new Map<string, Tool<any>>();

  private static groups: Record<string, string[]> = {
    'group:fs': ['read_file', 'write_file', 'edit_file', 'list_files'],
    'group:runtime': ['exec'],
    'group:web': ['web_search', 'web_fetch'],
    'group:ui': ['browser'],
    'group:sessions': ['sessions_spawn', 'sessions_list'],
  };

  private static profiles: Record<ToolProfile, string[]> = {
    minimal: [],
    coding: ['group:fs', 'group:runtime'],
    messaging: ['group:sessions'],
    full: ['*'],
  };

  static register(tool: Tool<any>) {
    const name = tool.name.toLowerCase();
    this.tools.set(name, tool);
  }

  static registerDefaults() {
    this.register(new ReadFileTool());
    this.register(new WriteFileTool());
    this.register(new EditFileTool());
    this.register(new ListFilesTool());
  }

  static getTools(config?: ToolConfig): Tool<any>[] {
    // Ensure defaults are registered if none exist
    if (this.tools.size === 0) {
      this.registerDefaults();
    }

    const profile = config?.profile || 'full';
    const allow = config?.allow || [];
    const deny = config?.deny || [];

    let allowedToolNames = new Set<string>();

    const profileTools = this.profiles[profile];

    this.expandItems(profileTools).forEach((t) => allowedToolNames.add(t.toLowerCase()));

    this.expandItems(allow).forEach((t) => allowedToolNames.add(t.toLowerCase()));

    const deniedToolNames = new Set<string>(this.expandItems(deny).map((t) => t.toLowerCase()));

    const result: Tool<any>[] = [];
    for (const [name, tool] of this.tools.entries()) {
      const isAllowed = allowedToolNames.has('*') || allowedToolNames.has(name);
      const isDenied = deniedToolNames.has('*') || deniedToolNames.has(name);

      if (isAllowed && !isDenied) {
        result.push(tool);
      }
    }

    if (profile === 'full' && (config?.allow?.includes('*') || allowedToolNames.has('*'))) {
      console.warn(`[SECURITY] Agent initialized with 'full' tool profile. USE WITH CAUTION.`);
    }

    return result;
  }

  private static expandItems(items: string[]): string[] {
    const expanded: string[] = [];
    for (const item of items) {
      if (item.startsWith('group:')) {
        const groupItems = this.groups[item] || [];
        expanded.push(...groupItems);
      } else {
        expanded.push(item);
      }
    }
    return expanded;
  }
}
