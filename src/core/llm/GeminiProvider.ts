import crypto from 'crypto';
import {FunctionCallingMode, GoogleGenerativeAI} from '@google/generative-ai';
import {LLMProvider, LLMResponse, StreamDeltaHandler, StreamOptions} from './LLMProvider.js';
import type {Message, Tool, ToolCall} from '../types.js';

export class GeminiProvider implements LLMProvider {
  private client: GoogleGenerativeAI;
  private model: string;
  private apiVersion?: string;

  constructor(apiKey: string, model: string, apiVersion?: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.apiVersion = apiVersion;
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
    const model = this.client.getGenerativeModel(
      { model: this.model },
      this.apiVersion ? { apiVersion: this.apiVersion } : undefined
    );
    const request = this.buildRequest(systemPrompt, history, tools);

    if (!onDelta) {
      const result = await model.generateContent(request, { signal: options?.abortSignal });
      return this.parseResponse(result.response);
    }

    const streamResult = await model.generateContentStream(request, {
      signal: options?.abortSignal,
    });

    let content = '';
    for await (const chunk of streamResult.stream) {
      if (options?.abortSignal?.aborted) break;
      try {
        const delta = chunk.text();
        if (delta) {
          content += delta;
          onDelta(delta);
        }
      } catch {
        // ignore partials that can't be converted to text
      }
    }

    const final = await streamResult.response;
    const parsed = this.parseResponse(final);
    if (!parsed.content) parsed.content = content || null;
    return parsed;
  }

  private buildRequest(systemPrompt: string, history: Message[], tools?: Tool<any>[]) {
    const contents = history.map((m) => this.mapMessage(m));

    const hasToolSupport = this.apiVersion === 'v1beta' && tools && tools.length > 0;
    const functionDeclarations = hasToolSupport
      ? tools!.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: this.sanitizeSchema(t.getJsonSchema()),
        }))
      : undefined;

    const forcedToolNames = hasToolSupport ? this.detectForcedTools(history, tools!) : [];

    const seededContents =
      systemPrompt && systemPrompt.trim().length > 0
        ? [{ role: 'user', parts: [{ text: systemPrompt }] }, ...contents]
        : contents;

    return {
      contents: seededContents,
      tools: functionDeclarations?.length ? [{ functionDeclarations }] : undefined,
      toolConfig: functionDeclarations?.length
        ? forcedToolNames.length
          ? {
              functionCallingConfig: {
                mode: FunctionCallingMode.ANY,
                allowedFunctionNames: forcedToolNames,
              },
            }
          : { functionCallingConfig: { mode: FunctionCallingMode.AUTO } }
        : undefined,
    };
  }

  private mapMessage(m: Message) {
    if (m.role === 'tool') {
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.name || 'tool',
              response: this.safeJson(m.content),
            },
          },
        ],
      };
    }

    if (m.role === 'assistant' && m.tool_calls?.length) {
      const parts: any[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const call of m.tool_calls) {
        parts.push({
          functionCall: {
            name: call.function.name,
            args: this.safeJson(call.function.arguments),
          },
        });
      }
      return { role: 'model', parts: parts.length ? parts : [{ text: '' }] };
    }

    if (m.role === 'assistant') {
      return { role: 'model', parts: [{ text: m.content || '' }] };
    }

    return { role: 'user', parts: [{ text: m.content || '' }] };
  }

  private parseResponse(response: any): LLMResponse {
    let text: string | null = null;
    try {
      text = response.text();
    } catch {
      text = null;
    }

    const calls = (response.functionCalls?.() || []) as Array<{ name: string; args: object }>;
    const toolCalls: ToolCall[] = calls.map((call) => ({
      id: crypto.randomUUID(),
      type: 'function',
      function: {
        name: call.name,
        arguments: JSON.stringify(call.args ?? {}),
      },
    }));

    return {
      content: text,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };
  }

  private safeJson(value: string | null | undefined): object {
    if (!value) return {};
    try {
      return JSON.parse(value);
    } catch {
      return { result: value };
    }
  }

  private sanitizeSchema(schema: any): any {
    const allowedKeys = new Set([
      'type',
      'properties',
      'items',
      'required',
      'description',
      'enum',
      'format',
      'nullable',
    ]);

    if (schema === null || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map((item) => this.sanitizeSchema(item));

    const result: any = {};
    for (const [key, value] of Object.entries(schema)) {
      if (!allowedKeys.has(key)) continue;
      if (key === 'properties' && value && typeof value === 'object') {
        const props: any = {};
        for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
          props[propKey] = this.sanitizeSchema(propVal);
        }
        result.properties = props;
        continue;
      }
      if (key === 'items') {
        result.items = this.sanitizeSchema(value);
        continue;
      }
      result[key] = this.sanitizeSchema(value);
    }

    if (result.type === 'object' && !result.properties) {
      result.properties = {};
    }

    return result;
  }

  private detectForcedTools(history: Message[], tools: Tool<any>[]): string[] {
    const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
    if (!lastUser) return [];
    const text = lastUser.toLowerCase();
    return tools
        .map((t) => t.name)
        .filter((name) => text.includes(name.toLowerCase()));
  }
}
