import type {
  CompletionRequest,
  CompletionResponse,
  CompletionStreamChunk,
  GatewayModel,
  GatewayProvider,
  ProviderHealth,
} from "./types.js";
import { generateText, streamText } from "ai";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";

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
  private provider: OpenAIProvider;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
  ) {
    this.provider = createOpenAI({
      baseURL: baseUrl,
      apiKey: apiKey,
    });
  }

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
    const result = await generateText({
      model: this.provider(request.model as any),
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxTokens,
      system: request.system,
    });
    return {
      text: result.text,
      model: request.model,
      provider: this.name,
    };
  }

  async *stream(
    request: CompletionRequest,
  ): AsyncGenerator<CompletionStreamChunk> {
    const result = streamText({
      model: this.provider(request.model as any),
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxTokens,
      system: request.system,
    });
    for await (const chunk of result.textStream) {
      yield {
        text: chunk,
        model: request.model,
        provider: this.name,
      };
    }
  }

  private buildHeaders(): Record<string, string> {
    if (!this.apiKey) return {};
    return { authorization: `Bearer ${this.apiKey}` };
  }
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
