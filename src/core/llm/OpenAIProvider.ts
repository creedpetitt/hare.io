import OpenAI from 'openai';
import crypto from 'crypto';
import { LLMProvider, LLMResponse, StreamDeltaHandler, StreamOptions } from './LLMProvider.js';
import { Message, Tool } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(
    systemPrompt: string,
    history: Message[],
    tools?: Tool<any>[]
  ): Promise<LLMResponse> {
    return this.generateStream(systemPrompt, history, tools);
  }

  async generateStream(
    systemPrompt: string,
    history: Message[],
    tools?: Tool<any>[],
    onDelta?: StreamDeltaHandler,
    options?: StreamOptions
  ): Promise<LLMResponse> {
    const normalizeToolId = this.createToolIdNormalizer();
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => this.mapMessage(m, normalizeToolId)),
    ];

    const openAITools = tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.getJsonSchema() as any,
      },
    }));

    const stream = this.openai.chat.completions.stream({
      model: this.model,
      messages: messages as any,
      tools: openAITools?.length ? openAITools : undefined,
    });

    if (options?.abortSignal) {
      if (options.abortSignal.aborted) {
        stream.abort();
      } else {
        options.abortSignal.addEventListener('abort', () => stream.abort(), { once: true });
      }
    }

    let content = '';

    if (onDelta) {
      stream.on('content', (delta) => {
        if (options?.abortSignal?.aborted) return;
        content += delta;
        onDelta(delta);
      });
    }

    const toolCalls = new Map<number, { id?: string; name?: string; arguments: string }>();
    stream.on('tool_calls.function.arguments.delta', (event) => {
      const index = event.index ?? 0;
      const existing = toolCalls.get(index) || { arguments: '' };
      if (event.arguments) existing.arguments += event.arguments;
      if (event.parsed_arguments && typeof event.parsed_arguments === 'object') {
        try {
          existing.arguments = JSON.stringify(event.parsed_arguments);
        } catch {
          // ignore
        }
      }
      if (event.name) existing.name = event.name;
      toolCalls.set(index, existing);
    });

    try {
      const final = await stream.finalChatCompletion();
      const choice = final.choices[0]?.message;
      if (!content) {
        content = choice?.content || '';
      }

      if (choice?.tool_calls?.length) {
        const parsed = choice.tool_calls.map((call, index) => {
          const mapped = {
            id: call.id || crypto.randomUUID(),
            type: 'function' as const,
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          };
          toolCalls.set(index, {
            id: mapped.id,
            name: mapped.function.name,
            arguments: mapped.function.arguments,
          });
          return mapped;
        });

        return {
          content: content || null,
          toolCalls: parsed as any,
        };
      }
    } catch (error: any) {
      if (error?.name === 'APIUserAbortError' || error?.code === 'abort') {
        const err: any = new Error('Stream aborted');
        err.code = 'agent_cancelled';
        throw err;
      }
      throw error;
    }

    const parsedToolCalls = Array.from(toolCalls.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, entry]) => ({
        id: entry.id || crypto.randomUUID(),
        type: 'function' as const,
        function: {
          name: entry.name || 'unknown_tool',
          arguments: entry.arguments || '{}',
        },
      }))
      .filter((toolCall) => toolCall.function.name !== 'unknown_tool');

    return {
      content: content || null,
      toolCalls: parsedToolCalls.length > 0 ? (parsedToolCalls as any) : undefined,
    };
  }

  private mapMessage(m: Message, normalizeToolId?: (id: string) => string) {
    const msg: any = { role: m.role, content: m.content };
    if (m.name) msg.name = m.name;
    if (m.tool_calls) {
      msg.tool_calls = m.tool_calls.map((tc) => ({
        ...tc,
        id: normalizeToolId ? normalizeToolId(tc.id) : tc.id,
      }));
    }
    if (m.tool_call_id) {
      msg.tool_call_id = normalizeToolId ? normalizeToolId(m.tool_call_id) : m.tool_call_id;
    }
    return msg;
  }

  private createToolIdNormalizer() {
    const cache = new Map<string, string>();
    return (id: string) => {
      const existing = cache.get(id);
      if (existing) return existing;
      if (id.length <= 40) {
        cache.set(id, id);
        return id;
      }
      const normalized = crypto.createHash('sha1').update(id).digest('hex').slice(0, 40);
      cache.set(id, normalized);
      return normalized;
    };
  }
}
