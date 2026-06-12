// Shared runtime input type for CLI harness and desktop app.

import type {
  GatewayModeDefaults,
  GatewayProviderId,
  TokenUsage,
} from "@codemap-ai/core/agent";
import type { AskQuestionOption, HarnessQuestionAnswer, HarnessQuestionSelectionMode, HarnessDisplayState } from "./events.js";
import type { HarnessDeps } from "./harness/lifecycle.js";

export type ChatUiMode = "tui" | "electron" | string;

export type AgentPhase = "planning" | "executing";
export type PlanReviewAction = "apply" | "cancel" | string;

/**
 * Interface for a tool client that the harness runtime uses.
 * Both CLI's CodeMapMcpToolClient and desktop equivalents implement this.
 */
export interface ToolClientLike {
  getServerConfig(): { command: string; args?: string[]; env?: Record<string, string> };
  getExtraServerConfigs(): Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

/**
 * Interface for an AI provider (NineRouterProvider or compatible).
 */
export interface ProviderLike {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
}

export interface SingleAgentRuntimeInput {
  provider: ProviderLike;
  providerId?: GatewayProviderId;
  model: string;
  modeDefaults?: GatewayModeDefaults;
  /** Real model IDs from the gateway — used to resolve profile aliases like "coder". */
  availableModels?: string[];
  /** Combo IDs from the gateway — passed through without model resolution. */
  availableCombos?: string[];
  agentInstructions?: string;
  userMessage: { role: string; content: string };
  toolClient: ToolClientLike;
  onToken?: (text: string) => void;
  onThinking?: (text: string) => void;
  /** Called when an intermediate agent message completes (before more tool calls follow). */
  onStreamReset?: () => void;
  onModel?: (model: string) => void;
  onToolStart?: (name: string, args: string, id: string, preview?: string) => void;
  onToolResult?: (name: string, result: string, id?: string) => void;
  toolPreviewBuilder?: (
    name: string,
    args: Record<string, unknown>,
  ) => string | undefined;
  onMessageStart?: (createdAt: number) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  onPlanReady?: (plan: string) => void;
  onPlanWait?: () => Promise<PlanReviewAction>;
  onOMObservation?: (tokensObserved: number, observationTokens: number) => void;
  onOMReflection?: (compressedTokens: number) => void;
  onAskQuestion?: (questionId: string, question: string, options: AskQuestionOption[] | undefined, respond: (answer: HarnessQuestionAnswer) => void, selectionMode?: HarnessQuestionSelectionMode) => void;
  onToolApproval?: (pendingApproval: NonNullable<HarnessDisplayState["pendingApproval"]>, respond: (decision: "approve" | "decline" | "always_allow_category") => void) => void;
  onPhaseStart?: (phase: AgentPhase, model: string) => void;
  /** When true, switch harness to "plan" mode before sending. */
  planMode?: boolean;
  signal?: AbortSignal;
  imageFiles?: Array<{ data: string; mimeType: string }>;
  effort?: "low" | "medium" | "high";
  /** Injectable host-specific dependencies for the harness lifecycle. */
  deps?: HarnessDeps;
}
