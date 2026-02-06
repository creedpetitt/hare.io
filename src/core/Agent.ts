import { ContextBuilder } from './ContextBuilder.js';
import { AgentConfig, AgentContext, Message, Tool, ToolCall } from './types.js';
import { LLMProvider, LLMResponse } from './llm/LLMProvider.js';
import { Compactor } from './memory/Compactor.js';
import { ToolRegistry } from './ToolRegistry.js';

export class Agent {
  private llm: LLMProvider;
  private contextBuilder: ContextBuilder;
  private sessionId: string;
  private agentId: string;
  private config: AgentConfig;
  private tools: Tool<any>[] = [];
  private compactor: Compactor;
  private conversationSummary: string = '';

  constructor(
    sessionId: string,
    llm: LLMProvider,
    agentId: string = 'main',
    configOverride?: Partial<AgentConfig>
  ) {
    this.sessionId = sessionId;
    this.llm = llm;
    this.agentId = agentId;
    this.contextBuilder = new ContextBuilder(undefined, agentId);
    this.compactor = new Compactor(llm);

    this.config = {
      agentId,
      model: 'gpt-4o',
      debug: false,
      compactionThreshold: 20,
      compactionKeep: 10,
      ...configOverride,
    } as AgentConfig;
  }

  async run(userInput: string): Promise<string> {
    const context = await this.prepareContext(userInput);
    let finalAnswer = '';

    while (true) {
      const response = await this.llm.generate(
        this.constructSystemPrompt(context),
        context.history,
        this.tools
      );

      await this.processAssistantResponse(response, context);

      if (response.content) finalAnswer = response.content;
      if (!response.toolCalls?.length) break;

      await this.executeTools(response.toolCalls, context);
    }

    return finalAnswer;
  }

  private async prepareContext(userInput: string): Promise<AgentContext> {
    const context = await this.contextBuilder.build(this.sessionId, this.config);
    this.config = context.config;
    this.tools = ToolRegistry.getTools(this.config.tools);

    if (!this.conversationSummary && context.summary) {
      this.conversationSummary = context.summary;
    }

    if (context.history.length > this.config.compactionThreshold) {
      await this.performCompaction(context);
    }

    const userMsg: Message = { role: 'user', content: userInput, timestamp: Date.now() };
    await this.contextBuilder.appendMessage(this.sessionId, userMsg);
    context.history.push(userMsg);

    return context;
  }

  private async performCompaction(context: AgentContext) {
    const keepCount = this.config.compactionKeep;
    const toCompact = context.history.slice(0, -keepCount);

    const result = await this.compactor.compact(toCompact, this.conversationSummary);
    this.conversationSummary = result.summary;

    for (const fact of result.newFacts) {
      await this.contextBuilder.appendMemory(fact);
    }

    await this.contextBuilder.saveSummary(this.sessionId, this.conversationSummary);
    const active = context.history.slice(-keepCount);
    await this.contextBuilder.archiveMessages(this.sessionId, toCompact, active);
    context.history = active;
  }

  private async processAssistantResponse(response: LLMResponse, context: AgentContext) {
    let content = response.content;

    if (content) {
      content = await this.extractAndSaveMemories(content);
    }

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
    for (const tc of toolCalls) {
      const tool = this.tools.find((t) => t.name.toLowerCase() === tc.function.name.toLowerCase());
      let resultStr: string;

      if (!tool) {
        resultStr = `Error: Tool ${tc.function.name} not found.`;
      } else {
        try {
          const args = JSON.parse(tc.function.arguments);
          if (this.config.debug) console.log(`[TOOL CALL] ${tool.name}(${tc.function.arguments})`);

          // Execution is now type-safe!
          // Even though 'tool' is Tool<any>, zod inside the tool
          // will validate 'args' during the internal execute call.
          const execution = await tool.execute(args, context);
          resultStr = execution.result;

          if (this.config.debug) console.log(`[TOOL RESULT] ${resultStr}`);
        } catch (e: any) {
          resultStr = `Error: ${e.message}`;
        }
      }

      const toolMsg: Message = {
        role: 'tool',
        name: tc.function.name,
        tool_call_id: tc.id,
        content: resultStr,
        timestamp: Date.now(),
      };

      await this.contextBuilder.appendMessage(this.sessionId, toolMsg);
      context.history.push(toolMsg);
    }
  }

  private async extractAndSaveMemories(content: string): Promise<string> {
    const memoryPattern = /\[\[MEMORY:\s*(.+?)\]\]/g;
    let match;
    while ((match = memoryPattern.exec(content)) !== null) {
      await this.contextBuilder.appendMemory(match[1]);
      if (this.config.debug) console.log(`[MEMORY] ${match[1]}`);
    }
    return content.replace(memoryPattern, '').trim();
  }

  private constructSystemPrompt(context: AgentContext): string {
    const toolsPrompt =
      this.tools.length > 0
        ? this.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
        : 'No tools available.';

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
      '=== PERSISTENT MEMORY ===',
      context.files.memory,
      '',
      '=== MEMORY PROTOCOL ===',
      'To save a permanent fact, use: [[MEMORY: fact]]',
      '',
      '=== AVAILABLE TOOLS ===',
      toolsPrompt,
    ];

    if (this.conversationSummary) {
      parts.unshift('=== CONVERSATION SUMMARY ===', this.conversationSummary, '');
    }

    return parts.join('\n').trim();
  }
}
