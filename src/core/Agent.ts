import { ContextBuilder } from './ContextBuilder.js';
import {
  AgentConfig,
  AgentContext,
  Message,
  Tool,
  ToolCall,
  ToolPolicy,
  ToolResult,
  ToolExecutionObserver,
  AssistantStreamObserver,
  SkillDefinition,
} from './types.js';
import { LLMProvider, LLMResponse, Usage } from './llm/LLMProvider.js';
import { Compactor } from './memory/Compactor.js';
import { ToolRegistry } from './ToolRegistry.js';
import { sanitizeHistory } from './history.js';

export class Agent {
  private llm: LLMProvider;
  private contextBuilder: ContextBuilder;
  private sessionId: string;
  private agentId: string;
  private config: AgentConfig;
  private tools: Tool<any>[] = [];
  private compactor: Compactor;
  private runId: string;
  private abortController?: AbortController;
  private toolObserver?: ToolExecutionObserver;
  private assistantObserver?: AssistantStreamObserver;
  private assistantIndex = 0;
  private lastLoggedActiveSkills = '';

  constructor(
    sessionId: string,
    llm: LLMProvider,
    agentId: string = 'main',
    configOverride?: Partial<AgentConfig>,
    options?: {
      runId?: string;
      abortSignal?: AbortSignal;
      toolObserver?: ToolExecutionObserver;
      assistantObserver?: AssistantStreamObserver;
    }
  ) {
    this.sessionId = sessionId;
    this.llm = llm;
    this.agentId = agentId;
    this.contextBuilder = new ContextBuilder(undefined, agentId);
    this.compactor = new Compactor(llm);
    this.runId = options?.runId || 'run';
    if (options?.abortSignal) {
      this.abortController = new AbortController();
      if (options.abortSignal.aborted) {
        this.abortController.abort(options.abortSignal.reason);
      } else {
        options.abortSignal.addEventListener('abort', () => {
          this.abortController?.abort(options.abortSignal?.reason);
        });
      }
    }
    this.toolObserver = options?.toolObserver;
    this.assistantObserver = options?.assistantObserver;

    this.config = {
      agentId,
      model: 'gpt-4o',
      debug: false,
      maxToolIterations: 6,
      compactionThreshold: 20,
      compactionKeep: 10,
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
    } as AgentConfig;
  }

  async run(userInput: string, options?: { forcedSkills?: string[] }): Promise<string> {
    const context = await this.prepareContext(userInput);
    const activeSkills = await this.selectActiveSkills(context.skills, options?.forcedSkills ?? []);
    const maxToolIterations = this.resolveMaxToolIterations();
    let toolIterations = 0;
    let stoppedByToolLimit = false;
    let finalAnswer = '';
    this.lastLoggedActiveSkills = '';

    // Initialize accumulated usage
    const accumulatedUsage: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    while (true) {
      this.throwIfAborted();
      const sanitizedHistory = sanitizeHistory(context.history);
      if (
        sanitizedHistory.droppedInvalidTools > 0 ||
        sanitizedHistory.normalizedAssistantContent > 0 ||
        sanitizedHistory.removedDanglingToolCalls > 0
      ) {
        if (this.config.debug) {
          if (sanitizedHistory.normalizedAssistantContent > 0) {
            console.warn(
              `[HISTORY] Normalized ${sanitizedHistory.normalizedAssistantContent} assistant message(s) with null content before model call.`
            );
          }
          if (sanitizedHistory.removedDanglingToolCalls > 0) {
            console.warn(
              `[HISTORY] Removed ${sanitizedHistory.removedDanglingToolCalls} dangling assistant tool_call message(s) before model call.`
            );
          }
          if (sanitizedHistory.droppedInvalidTools > 0) {
            console.warn(
              `[HISTORY] Dropped ${sanitizedHistory.droppedInvalidTools} orphan tool message(s) before model call.`
            );
          }
        }
        context.history = sanitizedHistory.messages;
      }

      const response = await this.llm.generateStream(
        this.constructSystemPrompt(context, activeSkills),
        context.history,
        this.tools,
        this.assistantObserver
          ? (delta) =>
              this.assistantObserver?.onAssistantDelta?.(this.runId, delta, this.assistantIndex++)
          : undefined,
        this.abortController ? { abortSignal: this.abortController.signal } : undefined
      );

      // Accumulate usage and emit via observer
      if (response.usage) {
        accumulatedUsage.promptTokens += response.usage.promptTokens;
        accumulatedUsage.completionTokens += response.usage.completionTokens;
        accumulatedUsage.totalTokens += response.usage.totalTokens;
        this.assistantObserver?.onUsage?.(this.runId, accumulatedUsage);
      }

      const responseText = (response.content ?? '').trim();
      if (responseText) {
        finalAnswer = responseText;
      }
      if (!response.toolCalls?.length) {
        await this.processAssistantResponse(response, context);
        if (!finalAnswer) {
          finalAnswer = 'I completed the request, but have no additional response text.';
        }
        break;
      }

      if (toolIterations >= maxToolIterations) {
        await this.processAssistantResponse(
          {
            ...response,
            toolCalls: undefined,
          },
          context
        );
        stoppedByToolLimit = true;
        break;
      }

      await this.processAssistantResponse(response, context);
      await this.executeTools(response.toolCalls, context);
      toolIterations += 1;
    }

    if (stoppedByToolLimit) {
      if (this.config.debug) {
        console.warn(
          `[AGENT] Stopped run after ${maxToolIterations} tool iteration(s) to prevent a tool-call loop.`
        );
      }
      finalAnswer =
        `I stopped after ${maxToolIterations} tool steps to prevent a loop.` +
        ' Please retry with a narrower prompt.';
    }

    if (this.config.debug) {
      console.log(`[AGENT] Final Total Usage: ${JSON.stringify(accumulatedUsage)}`);
    }

    return finalAnswer;
  }

  private async prepareContext(userInput: string): Promise<AgentContext> {
    const context = await this.contextBuilder.build(this.sessionId, this.config);
    this.config = context.config;
    this.tools = ToolRegistry.getTools(this.config.tools);

    const maxHistoryTokens = 32_000;
    const estimatedTokens = this.estimateHistoryTokens(context.history);

    if (
      context.history.length > this.config.compactionThreshold ||
      estimatedTokens > maxHistoryTokens
    ) {
      if (this.config.debug) {
        console.log(
          `[COMPACTION] Triggered. Messages: ${context.history.length}, Estimated Tokens: ${estimatedTokens}`
        );
      }
      await this.performCompaction(context);
    }

    const userMsg: Message = { role: 'user', content: userInput, timestamp: Date.now() };
    await this.contextBuilder.appendMessage(this.sessionId, userMsg);
    context.history.push(userMsg);

    return context;
  }

  private estimateHistoryTokens(history: Message[]): number {
    let totalChars = 0;
    for (const msg of history) {
      totalChars += (msg.content || '').length;
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          totalChars += tc.function.name.length + tc.function.arguments.length;
        }
      }
    }
    // Rough industry standard: 4 characters per token
    return Math.ceil(totalChars / 4);
  }

  private async performCompaction(context: AgentContext) {
    const keepCount = this.config.compactionKeep;
    const toCompact = context.history.slice(0, -keepCount);
    if (toCompact.length === 0) return;

    const currentMemory = await this.contextBuilder.loadMemorySnapshot();
    const result = await this.compactor.compact(toCompact, currentMemory, this.sessionId);
    const historySummary = result.historyEntry.trim();
    if (historySummary) {
      const historyEntry = formatHistoryEntry(this.sessionId, historySummary);
      await this.contextBuilder.appendHistoryEntry(historyEntry);
    }

    const nextMemory = result.memoryUpdate.trim();
    if (nextMemory.length > 0 && nextMemory !== currentMemory.trim()) {
      await this.contextBuilder.writeMemorySnapshot(nextMemory);
      context.memoryFacts = await this.contextBuilder.loadMemoryFacts(
        this.config.bootstrapMaxChars ?? 20_000
      );
    }
    const activeWindow = context.history.slice(-keepCount);
    const { messages: active, droppedInvalidTools } = sanitizeHistory(activeWindow);
    if (droppedInvalidTools > 0 && this.config.debug) {
      console.warn(
        `[HISTORY] Dropped ${droppedInvalidTools} orphan tool message(s) during compaction.`
      );
    }
    await this.contextBuilder.replaceSession(this.sessionId, active);
    context.history = active;
  }

  private async processAssistantResponse(response: LLMResponse, context: AgentContext) {
    const content = response.content ?? '';

    const assistantMsg: Message = {
      role: 'assistant',
      content,
      tool_calls: response.toolCalls,
      timestamp: Date.now(),
    };

    await this.contextBuilder.appendMessage(this.sessionId, assistantMsg);
    context.history.push(assistantMsg);
  }

  private async executeTools(toolCalls: ToolCall[], context: AgentContext) {
    const policyConfig = context.config.tools?.policy ?? context.config.toolPolicy;
    for (const tc of toolCalls) {
      this.throwIfAborted();
      const tool = this.tools.find((t) => t.name.toLowerCase() === tc.function.name.toLowerCase());
      let result: ToolResult;

      if (!tool) {
        result = {
          toolName: tc.function.name,
          success: false,
          result: `Error: Tool ${tc.function.name} not found.`,
          error: { code: 'tool_not_found', message: `Tool ${tc.function.name} not found.` },
        };
      } else {
        try {
          const args = JSON.parse(tc.function.arguments);
          if (this.config.debug) console.log(`[TOOL CALL] ${tool.name}(${tc.function.arguments})`);
          this.toolObserver?.onToolStart?.(this.runId, tool.name, args);

          // Execution is now type-safe!
          // Even though 'tool' is Tool<any>, zod inside the tool
          // will validate 'args' during the internal execute call.
          const effectivePolicy = this.resolveToolPolicy(tool.name, policyConfig);
          const execution = await runWithTimeout(
            tool.execute(args, context),
            effectivePolicy.timeoutMs
          );
          result = this.enforceResultLimits(execution, effectivePolicy);

          if (!result.success && !result.error) {
            result = {
              ...result,
              error: { code: 'tool_error', message: result.result },
            };
          }

          if (result.success) {
            this.toolObserver?.onToolEnd?.(this.runId, tool.name, result);
          } else if (result.error) {
            this.toolObserver?.onToolError?.(this.runId, tool.name, result.error);
          }

          if (this.config.debug) {
            const status = result.success ? 'ok' : 'error';
            const code = result.error?.code ? ` ${result.error.code}` : '';
            console.log(`[TOOL RESULT] ${status}${code}`);
          }
        } catch (e: any) {
          const code = e?.code || 'tool_exception';
          const message = e?.message || 'Tool execution failed.';
          result = {
            toolName: tool.name,
            success: false,
            result: `Error: ${message}`,
            error: { code, message },
          };
          if (result.error) {
            this.toolObserver?.onToolError?.(this.runId, tool.name, result.error);
          }
        }
      }

      const toolMsg: Message = {
        role: 'tool',
        name: tc.function.name,
        tool_call_id: tc.id,
        content: this.serializeToolResult(result),
        timestamp: Date.now(),
      };

      await this.contextBuilder.appendMessage(this.sessionId, toolMsg);
      context.history.push(toolMsg);
    }
  }

  private constructSystemPrompt(context: AgentContext, activeSkills: SkillDefinition[]): string {
    const toolsPrompt =
      this.tools.length > 0
        ? this.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
        : 'No tools available.';
    const skillsPrompt =
      context.skills.length > 0
        ? context.skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
        : 'No skills available.';
    const maxCharsPerSkill = this.resolveMaxCharsPerSkill();
    const activeSkillsPrompt =
      activeSkills.length > 0
        ? activeSkills
            .map(
              (s, index) =>
                `[SKILL ${index + 1}] ${s.name}\n${truncateText(s.content, maxCharsPerSkill)}`
            )
            .join('\n\n')
        : 'No active skills selected.';
    if (this.config.debug) {
      const activeNames = activeSkills.length > 0 ? activeSkills.map((s) => s.name).join(', ') : 'none';
      if (activeNames !== this.lastLoggedActiveSkills) {
        this.lastLoggedActiveSkills = activeNames;
        console.log(`[SKILLS] active=${activeNames}`);
      }
    }

    const parts = [
      '=== IDENTITY ===',
      context.files.identity,
      '',
      '=== PERSONALITY (SOUL) ===',
      context.files.soul,
      '',
      '=== OPERATIONAL RULES ===',
      context.files.agents,
      '',
      '=== USER PROFILE ===',
      context.files.user,
      '',
      '=== HEARTBEAT CHECKLIST ===',
      context.files.heartbeat,
      '',
      '=== PERSISTENT MEMORY ===',
      context.memoryFacts || 'No saved memory facts yet.',
      '',
      '=== MEMORY GUIDELINES ===',
      'Long-term facts are managed by compaction; do not emit memory tags in replies.',
      'If the user asks about earlier conversation/history/decisions, call search_history before answering.',
      'Use search_history to retrieve older compacted context on demand.',
      'Do not claim memory was saved unless memory was actually written by a tool or runtime.',
      '',
      '=== TOOL RESPONSE FORMAT ===',
      'Tool responses are JSON with fields: toolName, success, result, error.',
      'error is null or { code, message, details }.',
      '',
      '=== AVAILABLE SKILLS ===',
      skillsPrompt,
      '',
      '=== SKILL ACTIVATION RULES ===',
      '- Treat skills as optional playbooks.',
      '- Skills are activated by runtime directives (for example, /skill) and always-enabled skill metadata.',
      '- If active skills are listed below, follow them unless they conflict with higher-priority rules.',
      '- Do not invent missing steps for a skill.',
      '',
      '=== ACTIVE SKILLS (FULL CONTENT) ===',
      activeSkillsPrompt,
      '',
      '=== AVAILABLE TOOLS ===',
      toolsPrompt,
    ];

    return parts.join('\n').trim();
  }

  private resolveToolPolicy(
    toolName: string,
    policyConfig?: AgentConfig['toolPolicy']
  ): ToolPolicy {
    const defaults = policyConfig?.defaults || {};
    const specific = policyConfig?.byTool?.[toolName.toLowerCase()] || {};
    return {
      timeoutMs: 30_000,
      maxResultBytes: 1_000_000,
      ...defaults,
      ...specific,
    };
  }

  private enforceResultLimits(result: ToolResult, policy: ToolPolicy): ToolResult {
    if (policy.maxResultBytes && result.result) {
      const bytes = Buffer.byteLength(result.result, 'utf8');
      if (bytes > policy.maxResultBytes) {
        const truncated = truncateToBytes(result.result, policy.maxResultBytes);
        return {
          toolName: result.toolName,
          success: false,
          result: truncated,
          error: {
            code: 'tool_result_too_large',
            message: `Tool result exceeded ${policy.maxResultBytes} bytes.`,
            details: {
              limitBytes: policy.maxResultBytes,
              actualBytes: bytes,
              truncated: true,
            },
          },
        };
      }
    }

    return result;
  }

  private serializeToolResult(result: ToolResult): string {
    const serialized = JSON.stringify({
      toolName: result.toolName,
      success: result.success,
      result: result.result,
      error: result.error ?? null,
    });

    // If the result is massive (e.g. search dump or large file), 
    // truncate it for the long-term history to save context.
    const MAX_HISTORY_RESULT_CHARS = 4000;
    if (serialized.length > MAX_HISTORY_RESULT_CHARS) {
      return JSON.stringify({
        toolName: result.toolName,
        success: result.success,
        result: result.result.slice(0, MAX_HISTORY_RESULT_CHARS) + `... [TRUNCATED ${result.result.length - MAX_HISTORY_RESULT_CHARS} CHARS]`,
        error: result.error ?? null,
        note: "Result truncated in history to save context tokens."
      });
    }

    return serialized;
  }

  private throwIfAborted() {
    if (this.abortController?.signal.aborted) {
      const err: any = new Error('Agent run cancelled.');
      err.code = 'agent_cancelled';
      throw err;
    }
  }

  private async selectActiveSkills(
    skills: SkillDefinition[],
    forcedSkillNames: string[]
  ): Promise<SkillDefinition[]> {
    const maxActive = this.resolveMaxActiveSkills();
    if (maxActive <= 0 || skills.length === 0) return [];

    const availableByName = new Map<string, string>();
    for (const skill of skills) {
      availableByName.set(skill.name.toLowerCase(), skill.name);
    }

    const requested: string[] = [];
    for (const name of forcedSkillNames) {
      const normalized = availableByName.get(name.toLowerCase());
      if (normalized) requested.push(normalized);
    }
    for (const skill of skills) {
      if (skill.always) requested.push(skill.name);
    }
    if (requested.length === 0) return [];

    const maxCharsPerSkill = this.resolveMaxCharsPerSkill();
    const selectedNames = uniqueNames(requested).slice(0, maxActive);
    return this.contextBuilder.loadSkillsForContext(selectedNames, maxCharsPerSkill);
  }

  private resolveMaxActiveSkills(): number {
    const raw = this.config.skills?.maxActive;
    if (!raw || Number.isNaN(raw)) return 2;
    return Math.max(0, Math.min(10, Math.floor(raw)));
  }

  private resolveMaxToolIterations(): number {
    const raw = this.config.maxToolIterations;
    if (!raw || Number.isNaN(raw)) return 6;
    return Math.max(1, Math.min(20, Math.floor(raw)));
  }

  private resolveMaxCharsPerSkill(): number {
    const raw = this.config.skills?.maxCharsPerSkill;
    if (!raw || Number.isNaN(raw)) return 2_000;
    return Math.max(300, Math.min(20_000, Math.floor(raw)));
  }
}

function truncateToBytes(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) return value;
  return buffer.subarray(0, maxBytes).toString('utf8');
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err: any = new Error('Tool execution timed out.');
      err.code = 'tool_timeout';
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[TRUNCATED SKILL CONTENT TO ${maxChars} CHARS]`;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function formatHistoryEntry(sessionId: string, summary: string): string {
  const timestamp = new Date().toISOString();
  return [`## ${timestamp} session:${sessionId}`, 'Summary:', summary].join('\n');
}
