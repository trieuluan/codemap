import type {
  CompletionRequest,
  CompletionResponse,
  CompletionStreamChunk,
  GatewayModel,
  GatewayProvider,
  ProviderHealth,
} from "./types.js";

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
}

interface ChatCompletionStreamResponse {
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string;
    };
    text?: string;
  }>;
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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: buildMessages(request),
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Completion failed: HTTP ${response.status} ${text}`);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const text =
      body.choices?.[0]?.message?.content ?? body.choices?.[0]?.text ?? "";
    return {
      text,
      model: body.model ?? request.model,
      provider: this.name,
    };
  }

  async *stream(
    request: CompletionRequest,
  ): AsyncGenerator<CompletionStreamChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: buildMessages(request),
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const chunk = parseStreamLine(line);
          if (chunk === "done") return;
          if (!chunk) continue;
          yield chunk;
        }
      }

      buffer += decoder.decode();
      for (const line of buffer.split(/\r?\n/)) {
        const chunk = parseStreamLine(line);
        if (chunk === "done") return;
        if (!chunk) continue;
        yield chunk;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildHeaders(): Record<string, string> {
    if (!this.apiKey) return {};
    return { authorization: `Bearer ${this.apiKey}` };
  }
}

function buildMessages(request: CompletionRequest): CompletionRequest["messages"] {
  if (!request.system) return request.messages;
  return [{ role: "system", content: request.system }, ...request.messages];
}

function parseStreamLine(
  line: string,
): CompletionStreamChunk | "done" | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return undefined;
  if (!trimmed.startsWith("data:")) return undefined;

  const data = trimmed.slice("data:".length).trim();
  if (data === "[DONE]") return "done";

  const body = JSON.parse(data) as ChatCompletionStreamResponse;
  const text =
    body.choices?.[0]?.delta?.content ?? body.choices?.[0]?.text ?? "";
  if (!text) return undefined;
  return {
    text,
    model: body.model,
    provider: "9router",
  };
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
