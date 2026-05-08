export type ModelTier = "fast" | "strong" | "local";

export type GatewayMode =
  | "hybrid"
  | "local-only"
  | "cloud-ok"
  | "ask-before-cloud";

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

export interface ModelProfile {
  id: string;
  label: string;
  provider: "9router";
  model: string;
  tier: ModelTier;
  local: boolean;
}

export interface GatewayConfig {
  baseUrl: string;
  apiKey?: string;
  mode: GatewayMode;
  defaultProfile: string;
  profiles: ModelProfile[];
  configSource: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ChatToolCall[];
}

export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
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
  model?: string;
  provider: string;
}

export interface ProviderHealth {
  ok: boolean;
  message: string;
}

export interface GatewayModel {
  id: string;
  ownedBy?: string;
}

export interface GatewayProvider {
  name: string;
  healthCheck(): Promise<ProviderHealth>;
  listModels(): Promise<string[]>;
  listModelDetails(): Promise<GatewayModel[]>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncGenerator<CompletionStreamChunk>;
}

export interface RouteRequest {
  task: string;
  mode?: GatewayMode;
}

export interface RouteRecommendation {
  taskType: TaskType;
  risk: RiskLevel;
  mode: GatewayMode;
  profile: ModelProfile;
  fallbackProfile?: ModelProfile;
  reasons: string[];
}
