export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  raw?: unknown;
}

export type TaskType =
  | "feature"
  | "bugfix"
  | "debugging"
  | "review"
  | "refactor"
  | "test"
  | "research"
  | "general";

export type RiskLevel = "low" | "medium" | "high";

export type GatewayProviderId =
  | "9router"
  | "openai"
  | "self-hosted"
  | "anthropic"
  | "google"
  | "azure"
  | "groq"
  | "openrouter"
  | "deepseek"
  | "ollama"
  | "mistral";

export const GATEWAY_PROVIDER_IDS: readonly GatewayProviderId[] = [
  "9router",
  "openai",
  "self-hosted",
  "anthropic",
  "google",
  "azure",
  "groq",
  "openrouter",
  "deepseek",
  "ollama",
  "mistral",
] as const;

export interface GatewayModeDefaults {
  build?: string;
  plan?: string;
  fast?: string;
}

export interface GatewayConfig {
  provider: GatewayProviderId;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
  modeDefaults?: GatewayModeDefaults;
  models: string[];
  configSource: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "tool_call";
  content: string;
  /** Preserved reasoning/thinking content from thinking-mode models (e.g. DeepSeek-R1, mimo). */
  reasoning_content?: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ChatToolCall[];
  toolResults?: Array<{
    name: string;
    content: string;
    fullContent?: string;
    success?: boolean;
  }>;
}

export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface CompletionRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  system?: string;
  signal?: AbortSignal;
  tools?: ChatToolDefinition[];
  toolChoice?:
    | "auto"
    | "none"
    | { type: "function"; function: { name: string } };
}

export interface CompletionResponse {
  text: string;
  model?: string;
  provider: string;
  toolCalls?: ChatToolCall[];
}

export interface CompletionStreamChunk {
  text: string;
  reasoning?: string;
  model?: string;
  provider: string;
  toolCalls?: ChatToolCall[];
  usage?: TokenUsage;
  done?: boolean;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
}

export interface GatewayModel {
  id: string;
  object?: string;
  ownedBy?: string;
}

export interface GatewayProvider {
  name: string;
  healthCheck(): Promise<ProviderHealth>;
  listModels(): Promise<string[]>;
  listModelDetails(): Promise<GatewayModel[]>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest, debug?: boolean): AsyncGenerator<CompletionStreamChunk>;
}

export interface RouteRequest {
  task: string;
}

export interface RouteRecommendation {
  taskType: TaskType;
  risk: RiskLevel;
  model: string;
  reasons: string[];
}
