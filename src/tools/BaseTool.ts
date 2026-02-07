import { z } from 'zod';
import { AgentContext, Tool, ToolResult } from '../core/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export abstract class BaseTool<T extends z.ZodObject<any>> implements Tool<T> {
  abstract name: string;
  abstract description: string;
  abstract schema: T;

  abstract execute(args: z.infer<T>, context: AgentContext): Promise<ToolResult>;

  getJsonSchema(): object {
    return zodToJsonSchema(this.schema);
  }

  protected success(result: string): ToolResult {
    return {
      toolName: this.name,
      success: true,
      result,
    };
  }

  protected error(
    message: string,
    code: string = 'tool_error',
    details?: Record<string, unknown>
  ): ToolResult {
    return {
      toolName: this.name,
      success: false,
      result: message,
      error: { code, message, details },
    };
  }
}
