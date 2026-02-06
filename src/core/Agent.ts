import { ContextBuilder } from './ContextBuilder.js';
import { AgentConfig, AgentContext, Message, Tool } from './types.js';
import { LLMProvider } from './llm/LLMProvider.js';
import { Compactor } from './memory/Compactor.js';

export class Agent {
  private llm: LLMProvider;
  private contextBuilder: ContextBuilder;
  private sessionId: string;
  private config: AgentConfig;
  private tools: Map<string, Tool> = new Map();
  private compactor: Compactor;
  private conversationSummary: string = '';

  // Changed: Accepts LLMProvider instead of apiKey
  constructor(sessionId: string, llm: LLMProvider, configOverride?: Partial<AgentConfig>) {
    this.sessionId = sessionId;
    this.llm = llm;
    this.contextBuilder = new ContextBuilder();
    this.compactor = new Compactor(llm);
    
    this.config = {
      workspacePath: '',
      model: 'gpt-4o',
      debug: false,
      compactionThreshold: 20,
      compactionKeep: 10,
      ...configOverride,
    };
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  async run(userInput: string): Promise<string> {
    const context = await this.contextBuilder.build(this.sessionId, this.config);
    this.config = context.config; 
    
    // Load summary from disk if we don't have one in memory yet
    if (!this.conversationSummary && context.summary) {
      this.conversationSummary = context.summary;
    }

    // Check if compaction is needed
    if (context.history.length > this.config.compactionThreshold) {
      const keepCount = this.config.compactionKeep;
      const messagesToCompact = context.history.slice(0, -keepCount); 
      
      const result = await this.compactor.compact(messagesToCompact, this.conversationSummary);
      this.conversationSummary = result.summary;
      
      // Save any new facts discovered during compaction
      if (result.newFacts.length > 0) {
        for (const fact of result.newFacts) {
          if (this.config.debug) console.log(`[COMPACTION FACT] ${fact}`);
          await this.contextBuilder.appendMemory(fact);
        }
      }

      // Persist the new summary to disk
      await this.contextBuilder.saveSummary(this.sessionId, this.conversationSummary);

      // Move old messages to archive.jsonl and keep only the active ones in main.jsonl
      const activeMessages = context.history.slice(-keepCount);
      
      await this.contextBuilder.archiveMessages(this.sessionId, messagesToCompact, activeMessages);
      
      // Keep only recent messages in history (memory)
      context.history = activeMessages;
      
      if (this.config.debug) {
        console.log('\n[COMPACTION] Summarized conversation history.');
      }
    }

    const userMsg: Message = {
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    };
    await this.contextBuilder.appendMessage(this.sessionId, userMsg);
    context.history.push(userMsg);

    const systemPrompt = this.constructSystemPrompt(context);

    let answer = await this.llm.generate(systemPrompt, context.history);

    // Check for memory protocol: [[MEMORY: fact]]
    const memoryPattern = /\[\[MEMORY:\s*(.+?)\]\]/g;
    let match;
    const memoriesToSave: string[] = [];
    
    while ((match = memoryPattern.exec(answer)) !== null) {
      memoriesToSave.push(match[1]);
    }

    // Save memories and remove protocol from response
    if (memoriesToSave.length > 0) {
      for (const memory of memoriesToSave) {
        await this.contextBuilder.appendMemory(memory);
        if (this.config.debug) {
          console.log(`\n[MEMORY SAVED] ${memory}`);
        }
      }
      // Remove memory tags from the response
      answer = answer.replace(memoryPattern, '').trim();
    }

    const assistantMsg: Message = {
      role: 'assistant',
      content: answer,
      timestamp: Date.now(),
    };
    await this.contextBuilder.appendMessage(this.sessionId, assistantMsg);

    return answer;
  }

  async spawnSubAgent(task: string, parentSessionId: string): Promise<string> {
    const subSessionId = `${parentSessionId}-sub-${Date.now()}`;
    // Pass the SAME LLM provider to the child
    const subAgent = new Agent(subSessionId, this.llm, this.config);
    return subAgent.run(task);
  }

  private constructSystemPrompt(context: AgentContext): string {
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
      'To save a permanent fact about the user or conversation, use the format: [[MEMORY: fact]]',
      'Example: [[MEMORY: User\'s name is Creed]]',
      'The memory will be saved automatically and persist across sessions.',
      '',
      '=== AVAILABLE TOOLS ===',
      context.files.tools,
      '(Note: Functional tool access is strictly controlled by the runtime.)',
    ];

    if (this.conversationSummary) {
      parts.unshift(
        '=== CONVERSATION SUMMARY ===',
        this.conversationSummary,
        ''
      );
    }

    return parts.join('\n').trim();
  }
}
