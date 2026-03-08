import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import { AgentContext, ToolResult } from '../core/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ExecSchema = z.object({
  command: z.string().describe('The bash command to execute.'),
});

export class ExecTool extends BaseTool<typeof ExecSchema> {
  name = 'exec';
  description = 'Execute a bash command in the workspace directory. Use this to install dependencies, build projects, run tests, or manage files. For interactive commands, this will hang, so use non-interactive flags (e.g., npm install -y).';
  schema = ExecSchema;

  async execute(
    { command }: z.infer<typeof ExecSchema>,
    context: AgentContext
  ): Promise<ToolResult> {
    try {
      // Security: We execute in the workspace directory context
      const { stdout, stderr } = await execAsync(command, {
        cwd: context.config.workspacePath,
        timeout: 60000, // 60-second timeout to prevent hanging commands
      });

      let resultString = '';
      if (stdout) resultString += `STDOUT:\n${stdout}\n`;
      if (stderr) resultString += `STDERR:\n${stderr}\n`;
      
      if (!resultString) {
        resultString = 'Command executed successfully with no output.';
      }

      return this.success(resultString.trim());
    } catch (error: any) {
      // exec throws an error if the exit code is non-zero
      let errorMsg = `Command failed with exit code ${error.code}.\n`;
      if (error.stdout) errorMsg += `STDOUT:\n${error.stdout}\n`;
      if (error.stderr) errorMsg += `STDERR:\n${error.stderr}\n`;
      if (error.killed) errorMsg += `Command was killed (likely due to timeout).\n`;
      if (error.message && !error.stdout && !error.stderr) errorMsg += `Error: ${error.message}`;

      return this.error(errorMsg.trim(), 'exec_failed');
    }
  }
}
