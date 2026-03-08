import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import { AgentContext, ToolResult } from '../core/types.js';
import fs from 'fs/promises';
import path from 'path';

function resolveSafePath(userPath: string, workspacePath: string): string {
  if (!workspacePath) throw new Error('Critical: Workspace path is not configured.');

  // Block null bytes and other malicious characters
  if (userPath.includes('\0')) {
    throw new Error(`Security Alert: Null bytes detected in path.`);
  }

  // Block home directory shortcuts, drive letters, and backslashes
  if (userPath.startsWith('~') || /^[a-zA-Z]:\\/.test(userPath) || userPath.includes('\\')) {
    throw new Error(`Security Alert: Absolute, home-relative, or backslash-escaped paths are forbidden.`);
  }

  const resolved = path.resolve(workspacePath, userPath);
  
  // path.resolve might return an absolute path if userPath is absolute
  // We must ensure the final path is still within the workspace
  if (!resolved.startsWith(workspacePath)) {
    throw new Error(`Security Alert: Access denied for path "${userPath}". Path must stay within the workspace.`);
  }
  return resolved;
}

const ReadFileSchema = z.object({ path: z.string().describe('Relative path to the file.') });
export class ReadFileTool extends BaseTool<typeof ReadFileSchema> {
  name = 'read_file';
  description = 'Read the contents of a file in the workspace.';
  schema = ReadFileSchema;

  async execute(
    { path: userPath }: z.infer<typeof ReadFileSchema>,
    context: AgentContext
  ): Promise<ToolResult> {
    try {
      const fullPath = resolveSafePath(userPath, context.config.workspacePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return this.success(content);
    } catch (e: any) {
      return this.error(e.message);
    }
  }
}

const WriteFileSchema = z.object({
  path: z.string().describe('Relative path to the file.'),
  content: z.string().describe('Content to write.'),
});
export class WriteFileTool extends BaseTool<typeof WriteFileSchema> {
  name = 'write_file';
  description =
    'Write or overwrite a file in the workspace. Directories are created automatically if they do not exist.';
  schema = WriteFileSchema;

  async execute(
    { path: userPath, content }: z.infer<typeof WriteFileSchema>,
    context: AgentContext
  ): Promise<ToolResult> {
    try {
      const fullPath = resolveSafePath(userPath, context.config.workspacePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      return this.success(`Successfully wrote to ${userPath}`);
    } catch (e: any) {
      return this.error(e.message);
    }
  }
}

const EditFileSchema = z.object({
  path: z.string().describe('Relative path to the file.'),
  oldString: z.string().describe('The exact string to replace.'),
  newString: z.string().describe('The new string to insert.'),
});
export class EditFileTool extends BaseTool<typeof EditFileSchema> {
  name = 'edit_file';
  description = 'Replace a single occurrence of a string in a file.';
  schema = EditFileSchema;

  async execute(
    { path: userPath, oldString, newString }: z.infer<typeof EditFileSchema>,
    context: AgentContext
  ): Promise<ToolResult> {
    try {
      const fullPath = resolveSafePath(userPath, context.config.workspacePath);
      const content = await fs.readFile(fullPath, 'utf-8');

      const parts = content.split(oldString);
      if (parts.length === 1) return this.error(`String "${oldString}" not found.`);
      if (parts.length > 2)
        return this.error(`String "${oldString}" found multiple times. Be more specific.`);

      await fs.writeFile(fullPath, parts.join(newString), 'utf-8');
      return this.success(`Updated ${userPath} successfully.`);
    } catch (e: any) {
      return this.error(e.message);
    }
  }
}

const ListFilesSchema = z.object({
  path: z.string().default('.').describe('Relative path to list.'),
});
export class ListFilesTool extends BaseTool<typeof ListFilesSchema> {
  name = 'list_files';
  description = 'List files in a specific workspace directory.';
  schema = ListFilesSchema;

  async execute(
    { path: userPath }: z.infer<typeof ListFilesSchema>,
    context: AgentContext
  ): Promise<ToolResult> {
    try {
      const fullPath = resolveSafePath(userPath, context.config.workspacePath);
      const items = await fs.readdir(fullPath, { withFileTypes: true });
      const list = items
        .map((item) => `${item.isDirectory() ? '[DIR]' : '[FILE]'} ${item.name}`)
        .join('\n');
      return this.success(list || 'Directory is empty.');
    } catch (e: any) {
      return this.error(e.message);
    }
  }
}
