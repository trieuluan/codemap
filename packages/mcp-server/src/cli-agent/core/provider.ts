import { createOpenAI } from "@ai-sdk/openai";
import {
  generateText,
  jsonSchema,
  streamText,
  tool,
  type LanguageModelUsage,
  type ModelMessage,
  type TextStreamPart,
  type ToolChoice,
  type ToolSet,
  type TypedToolCall,
} from "ai";
import type {
  ChatMessage,
  ChatToolCall,
  ChatToolDefinition,
  CompletionRequest,
  CompletionResponse,
  CompletionStreamChunk,
  GatewayModel,
  GatewayProvider,
  ProviderHealth,
  TokenUsage,
} from "../types.js";

export class NineRouterProvider implements GatewayProvider {
  readonly name = "9router";

  constructor(
    private readonly _baseUrl: string,
    private readonly _apiKey: string | undefined,
  ) {}

  get baseUrl(): string { return this._baseUrl; }
  get apiKey(): string | undefined { return this._apiKey; }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const response = await fetch(`${this._baseUrl}/models`, {
        method: "GET",
        headers: this.buildHeaders(),
      });
      if (response.ok) {
        return {
          ok: true,
          message: `${this.name} reachable at ${this._baseUrl}`,
        };
      }
      return {
        ok: false,
        message: `${this.name} returned HTTP ${response.status} from ${this._baseUrl}/models`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `${this.name} unreachable: ${message}` };
    }
  }

  async listModels(): Promise<string[]> {
    const models = await this.listModelDetails();
    return models.map((model) => model.id);
  }

  async listModelDetails(): Promise<GatewayModel[]> {
    const response = await fetch(`${this._baseUrl}/models`, {
      method: "GET",
      headers: this.buildHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to list models: HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      data?: Array<{ id?: string; owned_by?: string; ownedBy?: string }>;
    };
    return (
      body.data?.flatMap((model) => {
        if (!isString(model.id)) return [];
        return [{ id: model.id, ownedBy: model.owned_by ?? model.ownedBy }];
      }) ?? []
    );
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const result = await generateText({
        model: this.model(request.model),
        system: request.system,
        messages: buildModelMessages(request.messages),
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens,
        tools: buildAiTools(request.tools),
        toolChoice: buildToolChoice(request.toolChoice),
        abortSignal: request.signal,
      });

      return {
        text: result.text,
        model: request.model,
        provider: this.name,
        toolCalls: normalizeAiToolCalls(result.toolCalls),
      };
    } catch (err) {
      if (request.signal?.aborted || isAbortError(err)) throw createAbortError();
      throw err;
    }
  }

  async *stream(
    request: CompletionRequest,
    _debug?: boolean,
  ): AsyncGenerator<CompletionStreamChunk> {
    let result: ReturnType<typeof streamText<ToolSet>>;
    try {
      result = streamText({
        model: this.model(request.model),
        system: request.system,
        messages: buildModelMessages(request.messages),
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens,
        tools: buildAiTools(request.tools),
        toolChoice: buildToolChoice(request.toolChoice),
        abortSignal: request.signal,
      });
    } catch (err) {
      if (request.signal?.aborted || isAbortError(err)) throw createAbortError();
      throw err;
    }

    try {
      let emittedToolCalls = false;
      for await (const part of result.fullStream) {
        throwIfAborted(request.signal);
        const chunk = streamPartToChunk(part, request.model, this.name);
        if (chunk?.toolCalls?.length) emittedToolCalls = true;
        if (chunk) yield chunk;
      }

      let usage: LanguageModelUsage | undefined;
      try { usage = await result.usage; } catch { usage = undefined; }
      let toolCalls: Array<TypedToolCall<ToolSet>> = [];
      try { toolCalls = await result.toolCalls; } catch { toolCalls = []; }
      if (!emittedToolCalls && toolCalls.length > 0) {
        yield {
          text: "",
          model: request.model,
          provider: this.name,
          toolCalls: normalizeAiToolCalls(toolCalls),
          done: true,
        };
      }
      if (usage) {
        yield {
          text: "",
          model: request.model,
          provider: this.name,
          usage: normalizeUsage(usage),
        };
      }
    } catch (err) {
      if (request.signal?.aborted || isAbortError(err)) throw createAbortError();
      throw err;
    }
  }

  private model(modelId: string | undefined) {
    return createOpenAI({
      baseURL: this._baseUrl,
      apiKey: this._apiKey,
      name: this.name,
    }).chat(modelId ?? "gpt-4.1");
  }

  private buildHeaders(): Record<string, string> {
    if (!this._apiKey) return {};
    return { authorization: `Bearer ${this._apiKey}` };
  }
}

// Pattern for inline base64 images: ![alt](data:image/type;base64,data)
const INLINE_IMAGE_RE = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([a-zA-Z0-9+/=\s]+))\)/g;

// Convert a message content string that may contain inline base64 images into
// an OpenAI-compatible multimodal content array. If no images are found the
// original string is returned so non-vision models are unaffected.
function toMultimodalContent(text: string): string | Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  let last = 0;
  let match: RegExpExecArray | null;

  INLINE_IMAGE_RE.lastIndex = 0;
  while ((match = INLINE_IMAGE_RE.exec(text)) !== null) {
    const before = text.slice(last, match.index).trim();
    if (before) parts.push({ type: "text", text: before });

    const mimeType = `image/${match[3]}`;
    const base64 = match[4]!.replace(/\s+/g, "");
    parts.push({
      type: "image",
      image: `data:${mimeType};base64,${base64}`,
    });

    last = match.index + match[0].length;
  }

  if (parts.length === 0) return text;

  const remaining = text.slice(last).trim();
  if (remaining) parts.push({ type: "text", text: remaining });
  return parts;
}

function buildModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages
    .flatMap((message): ModelMessage[] => {
      if (message.role === "system") {
        return [{ role: "system", content: message.content }];
      }
      if (message.role === "user") {
        return [{ role: "user", content: toMultimodalContent(message.content) } as ModelMessage];
      }
      if (message.role === "assistant") {
        return [{
          role: "assistant",
          content: message.content,
          ...(message.toolCalls?.length ? { toolCalls: message.toolCalls.map(toAiToolCall) } : {}),
        } as ModelMessage];
      }
      if (message.role === "tool_call" && message.toolResults?.length) {
        return [{
          role: "tool",
          content: message.toolResults.map((result) => ({
              type: "tool-result",
              toolCallId: message.toolCallId ?? "",
              toolName: result.name || message.name || "tool",
              output: { type: "text", value: result.fullContent ?? result.content },
            })),
        } as ModelMessage];
      }
      return [];
    });
}

function buildAiTools(tools: ChatToolDefinition[] | undefined): ToolSet | undefined {
  if (!tools || tools.length === 0) return undefined;
  return Object.fromEntries(
    tools.map((definition) => [
      definition.function.name,
      tool({
        description: definition.function.description,
        inputSchema: jsonSchema(
          definition.function.parameters ?? { type: "object", properties: {} },
        ),
      }),
    ]),
  ) as ToolSet;
}

function buildToolChoice(
  choice: CompletionRequest["toolChoice"],
): ToolChoice<ToolSet> | undefined {
  if (!choice) return undefined;
  if (choice === "auto" || choice === "none") return choice;
  return { type: "tool", toolName: choice.function.name };
}

function toAiToolCall(toolCall: ChatToolCall) {
  return {
    type: "tool-call" as const,
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    input: parseToolArguments(toolCall.function.arguments),
  };
}

function normalizeAiToolCalls(
  toolCalls: Array<TypedToolCall<ToolSet>> | undefined,
): ChatToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.flatMap((toolCall, index) => {
    const name = toolCall.toolName;
    if (!name) return [];
    return [{
      id: toolCall.toolCallId || `call_${index}`,
      type: "function" as const,
      function: {
        name,
        arguments: JSON.stringify("input" in toolCall ? toolCall.input ?? {} : {}),
      },
    }];
  });
}

function streamPartToChunk(
  part: TextStreamPart<ToolSet>,
  model: string | undefined,
  provider: string,
): CompletionStreamChunk | undefined {
  if (part.type === "text-delta") {
    return { text: part.text, model, provider };
  }
  if (part.type === "reasoning-delta") {
    return { text: "", reasoning: part.text, model, provider };
  }
  if (part.type === "tool-call") {
    return {
      text: "",
      model,
      provider,
      toolCalls: normalizeAiToolCalls([part]),
      done: true,
    };
  }
  if (part.type === "finish-step") {
    return { text: "", model, provider, usage: normalizeUsage(part.usage) };
  }
  return undefined;
}

function normalizeUsage(usage: LanguageModelUsage): TokenUsage {
  return {
    promptTokens: usage.inputTokens ?? 0,
    completionTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function createAbortError(): Error {
  const err = new Error("Task canceled.");
  err.name = "AbortError";
  return err;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}
