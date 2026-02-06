import { ContextBuilder } from './ContextBuilder.js';
import { AgentConfig, AgentContext, Message, Tool } from './types.js';
import { LLMProvider } from './llm/LLMProvider.js';
import { OpenAIProvider } from './llm/OpenAIProvider.js';

export class Agent {
  private llm: LLMProvider;
  private contextBuilder: ContextBuilder;
  private sessionId: string;
  private config: AgentConfig;
  private tools: Map<string, Tool> = new Map();

  // Changed: Accepts LLMProvider instead of apiKey
  constructor(sessionId: string, llm: LLMProvider, configOverride?: Partial<AgentConfig>) {
    this.sessionId = sessionId;
    this.llm = llm;
    this.contextBuilder = new ContextBuilder();
    
    this.config = {
      workspacePath: '',
      model: 'gpt-4o',
      debug: false,
      ...configOverride,
    };
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  async run(userInput: string): Promise<string> {
    const context = await this.contextBuilder.build(this.sessionId, this.config);
    this.config = context.config; 

    const userMsg: Message = {
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    };
    await this.contextBuilder.appendMessage(this.sessionId, userMsg);
    context.history.push(userMsg);

    const systemPrompt = this.constructSystemPrompt(context);
    
    // Using the Interface instead of OpenAI SDK
    const answer = await this.llm.generate(systemPrompt, context.history);

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
    return `
=== IDENTITY ===
${context.files.identity}

=== PERSONALITY (SOUL) ===
${context.files.soul}

=== OPERATIONAL RULES ===
${context.files.agents}

=== USER PROFILE ===
${context.files.user}

=== AVAILABLE TOOLS ===
${context.files.tools}
(Note: Functional tool access is strictly controlled by the runtime.)
    `.trim();
  }
}
