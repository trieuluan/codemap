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
} from "./types.js";

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: ChatToolCall[];
      toolCalls?: ChatToolCall[];
    };
    text?: string;
  }>;
}

interface ChatCompletionStreamResponse {
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    text?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class NineRouterProvider implements GatewayProvider {
  readonly name = "9router";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
  ) {}

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: "GET",
        headers: this.buildHeaders(),
      });
      if (response.ok) {
        return {
          ok: true,
          message: `${this.name} reachable at ${this.baseUrl}`,
        };
      }
      return {
        ok: false,
        message: `${this.name} returned HTTP ${response.status} from ${this.baseUrl}/models`,
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
    const response = await fetch(`${this.baseUrl}/models`, {
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
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      ...this.buildHeaders(),
      "content-type": "application/json",
    };
    const requestBody = JSON.stringify({
      model: request.model,
      messages: buildMessages(request),
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens,
      tools: sanitizeTools(request.tools),
      tool_choice: request.toolChoice,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: requestBody,
        signal: request.signal,
      });
    } catch (err) {
      if (request.signal?.aborted || isAbortError(err)) throw createAbortError();
      const cause = err instanceof Error && "cause" in err
        ? ` (cause: ${JSON.stringify(err.cause)})`
        : "";
      throw new Error(
        `Complete fetch failed: ${url} — ${err instanceof Error ? err.message : String(err)}${cause}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Completion failed: HTTP ${response.status} ${text}`);
    }

    const raw = await response.text();
    const body = parseCompletionBody(raw) as ChatCompletionResponse;
    const message = body.choices?.[0]?.message;
    const text = message?.content ?? body.choices?.[0]?.text ?? "";
    return {
      text,
      model: body.model ?? request.model,
      provider: this.name,
      toolCalls: normalizeToolCalls(message?.tool_calls ?? message?.toolCalls),
    };
  }

  async *stream(
    request: CompletionRequest,
    _debug?: boolean,
  ): AsyncGenerator<CompletionStreamChunk> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers = {
      ...this.buildHeaders(),
      "content-type": "application/json",
    };
    const body = JSON.stringify({
      model: request.model,
      messages: buildMessages(request),
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens,
      stream: true,
      tools: sanitizeTools(request.tools),
      stream_options: { include_usage: true },
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: request.signal,
      });
    } catch (err) {
      if (request.signal?.aborted || isAbortError(err)) throw createAbortError();
      const cause = err instanceof Error && "cause" in err
        ? ` (cause: ${JSON.stringify(err.cause)})`
        : "";
      throw new Error(
        `Stream fetch failed: ${url} — ${err instanceof Error ? err.message : String(err)}${cause}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Completion failed: HTTP ${response.status} ${text}`);
    }
    if (!response.body) {
      throw new Error("Completion stream failed: response body is empty.");
    }


    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallsByIdx = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let model: string | undefined;

    try {
      const emitLine = (line: string): CompletionStreamChunk | "done" | undefined => {
        const parsed = parseStreamLine(line);
        if (parsed === "done" || !parsed) return parsed;
        if (parsed.model) model = parsed.model;
        if (parsed.toolCallDelta) {
          const tc = parsed.toolCallDelta;
          const idx = tc.index ?? 0;
          if (!toolCallsByIdx.has(idx)) {
            toolCallsByIdx.set(idx, { id: "", name: "", arguments: "" });
          }
          const entry = toolCallsByIdx.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.name) entry.name = tc.name;
          if (tc.arguments) entry.arguments += tc.arguments;
          return undefined; // don't yield yet
        }
        return parsed;
      };

      while (true) {
        throwIfAborted(request.signal);
        const { done, value } = await reader.read();
        throwIfAborted(request.signal);
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          throwIfAborted(request.signal);
          const result = emitLine(line);
          if (result === "done") {
            yield* finalizeToolCalls(toolCallsByIdx, model);
            return;
          }
          if (result) yield result;
        }
      }

      buffer += decoder.decode();
      for (const line of buffer.split(/\r?\n/)) {
        throwIfAborted(request.signal);
        const result = emitLine(line);
        if (result === "done") {
          yield* finalizeToolCalls(toolCallsByIdx, model);
          return;
        }
        if (result) yield result;
      }

      yield* finalizeToolCalls(toolCallsByIdx, model);
    } finally {
      reader.releaseLock();
    }
  }

  private buildHeaders(): Record<string, string> {
    if (!this.apiKey) return {};
    return { authorization: `Bearer ${this.apiKey}` };
  }
}

// Pattern for inline base64 images: ![alt](data:image/type;base64,data)
const INLINE_IMAGE_RE = /!\[([^\]]*)\]\((data:image\/([^;]+);base64,([a-zA-Z0-9+/=\s]+))\)/g;

// Convert a message content string that may contain inline base64 images into
// an OpenAI-compatible multimodal content array. If no images are found the
// original string is returned so non-vision models are unaffected.
function toMultimodalContent(text: string): string | unknown[] {
  const parts: unknown[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  INLINE_IMAGE_RE.lastIndex = 0;
  while ((match = INLINE_IMAGE_RE.exec(text)) !== null) {
    const before = text.slice(last, match.index).trim();
    if (before) parts.push({ type: "text", text: before });

    const mimeType = `image/${match[3]}`;
    const base64 = match[4]!.replace(/\s+/g, "");
    parts.push({
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${base64}`, detail: "auto" },
    });

    last = match.index + match[0].length;
  }

  if (parts.length === 0) return text; // no images — keep as string

  const remaining = text.slice(last).trim();
  if (remaining) parts.push({ type: "text", text: remaining });
  return parts;
}

function buildMessages(request: CompletionRequest): Record<string, unknown>[] {
  const messages: ChatMessage[] = request.system
    ? [{ role: "system", content: request.system }, ...request.messages]
    : request.messages;
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
        name: message.name,
      };
    }

    return {
      role: message.role,
      content: toMultimodalContent(message.content),
      ...(message.toolCalls && message.toolCalls.length > 0
        ? { tool_calls: message.toolCalls }
        : {}),
    };
  });
}

function parseStreamLine(
  line: string,
): (CompletionStreamChunk & { toolCallDelta?: { index?: number; id?: string; name?: string; arguments?: string } }) | "done" | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return undefined;
  if (!trimmed.startsWith("data:")) return undefined;

  let data = trimmed.slice("data:".length).trim();
  if (data === "[DONE]") return "done";

  // Handle double 'data:' prefix from some SSE implementations
  if (data.startsWith("data:")) {
    data = data.slice("data:".length).trim();
  }

  let body: ChatCompletionStreamResponse;
  try {
    body = JSON.parse(data) as ChatCompletionStreamResponse;
  } catch {
    // Skip malformed SSE lines
    return undefined;
  }

  // Extract usage if present (sent in final chunk when stream_options.include_usage = true)
  let usage: TokenUsage | undefined;
  if (body.usage) {
    usage = {
      promptTokens: body.usage.prompt_tokens ?? 0,
      completionTokens: body.usage.completion_tokens ?? 0,
      totalTokens: body.usage.total_tokens ?? 0,
    };
  }

  const delta = body.choices?.[0]?.delta;
  const toolCallDeltas = delta?.tool_calls;
  if (toolCallDeltas && toolCallDeltas.length > 0) {
    const tc = toolCallDeltas[0];
    return {
      text: "",
      model: body.model,
      provider: "9router",
      ...(usage ? { usage } : {}),
      toolCallDelta: {
        index: tc?.index,
        id: tc?.id,
        name: tc?.function?.name,
        arguments: tc?.function?.arguments,
      },
    };
  }

  const text = delta?.content ?? body.choices?.[0]?.text ?? "";
  // Usage-only chunk (no text, no tool calls) — still emit it so caller can collect
  if (!text && usage) {
    return { text: "", model: body.model, provider: "9router", usage };
  }
  if (!text) return undefined;
  return {
    text,
    model: body.model,
    provider: "9router",
    ...(usage ? { usage } : {}),
  };
}

function* finalizeToolCalls(
  toolCallsByIdx: Map<number, { id: string; name: string; arguments: string }>,
  model: string | undefined,
): Generator<CompletionStreamChunk> {
  if (toolCallsByIdx.size === 0) return;
  const toolCalls: ChatToolCall[] = Array.from(toolCallsByIdx.values())
    .filter((tc) => tc.name)
    .map((tc, index) => ({
      id: tc.id || `call_${index}`,
      type: "function" as const,
      function: { name: tc.name, arguments: tc.arguments },
    }));
  if (toolCalls.length === 0) return;
  yield {
    text: "",
    model,
    provider: "9router",
    toolCalls,
    done: true,
  };
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

function parseCompletionBody(raw: string): ChatCompletionResponse {
  const trimmed = raw.trim();

  // Normal JSON response
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as ChatCompletionResponse;
  }

  // SSE response — extract JSON from "data:" lines
  let mergedText = "";
  const toolCallsByIdx = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let model: string | undefined;

  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l.startsWith("data:")) continue;

    let data = l.slice("data:".length).trim();
    if (data === "[DONE]") continue;
    if (data.startsWith("data:")) {
      data = data.slice("data:".length).trim();
    }

    let chunk: Record<string, unknown>;
    try {
      chunk = JSON.parse(data);
    } catch {
      continue;
    }

    if (!model && chunk.model) model = chunk.model as string;

    const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];

    // Non-streaming SSE: message field with content/tool_calls directly
    if (choice?.message) {
      return chunk as unknown as ChatCompletionResponse;
    }

    // Streaming format: accumulate delta
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (delta?.content) mergedText += delta.content as string;

    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
        const idx = (tc.index as number) ?? 0;
        if (!toolCallsByIdx.has(idx)) {
          toolCallsByIdx.set(idx, { id: "", name: "", arguments: "" });
        }
        const entry = toolCallsByIdx.get(idx)!;
        if (tc.id) entry.id = tc.id as string;
        const fn = tc.function as Record<string, unknown> | undefined;
        if (fn?.name) entry.name = fn.name as string;
        if (fn?.arguments) entry.arguments += fn.arguments as string;
      }
    }
  }

  // Build the merged streaming response
  const toolCalls = Array.from(toolCallsByIdx.values()).map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: { name: tc.name, arguments: tc.arguments },
  }));

  const result: Record<string, unknown> = {
    model,
    choices: [{ message: { content: mergedText } }],
  };
  if (toolCalls.length > 0) {
    ((result.choices as Array<Record<string, unknown>>)[0].message as Record<string, unknown>).tool_calls = toolCalls;
  }
  return result as unknown as ChatCompletionResponse;
}


function sanitizeTools(
  tools: ChatToolDefinition[] | undefined,
): ChatToolDefinition[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      ...(tool.function.parameters && typeof tool.function.parameters === "object"
        ? { parameters: tool.function.parameters }
        : {}),
    },
  }));
}

function normalizeToolCalls(
  toolCalls: ChatToolCall[] | undefined,
): ChatToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.flatMap((toolCall, index) => {
    const name = toolCall.function?.name;
    if (!name) return [];
    return [
      {
        id: toolCall.id || `call_${index}`,
        type: "function" as const,
        function: {
          name,
          arguments:
            typeof toolCall.function.arguments === "string"
              ? toolCall.function.arguments
              : JSON.stringify(toolCall.function.arguments ?? {}),
        },
      },
    ];
  });
}
