// Shared runtime input type for CLI harness and desktop app.

import type {
  GatewayModeDefaults,
  GatewayProviderId,
  TokenUsage,
} from "@codemap-ai/core/agent";
import type { AskQuestionOption, HarnessQuestionAnswer, HarnessQuestionSelectionMode, HarnessDisplayState } from "./events.ts";
import type { ResolvedCustomTool } from "./tools/custom/index.ts";

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

/**
 * Functions that must be provided by the host (CLI or desktop app).
 * All fields are optional — missing deps are skipped gracefully.
 */
export interface HarnessDeps {
  /** Load CLI/app settings (workingMemory toggle, etc.). */
  loadSettings?: () => Promise<{ agent?: { workingMemory?: boolean } }>;
  /** Load custom .tool.ts files from the workspace. */
  loadCustomTools?: (
    workspaceRoot: string,
  ) => Promise<{
    resolvedTools: ResolvedCustomTool[];
    extraTools: Record<string, unknown>;
  }>;
  /** Sync CodeMap hooks to .mastracode/hooks.json. */
  syncHooksToMastra?: (workspaceRoot: string) => void;
  /** Build Mastra permission rules for the given MCP server IDs. */
  buildMastraPermissionRules?: (
    mcpServerIds: Set<string>,
  ) => any;
  /** Register a provider in Mastra's global registry. */
  upsertGlobalMastraProvider?: (
    config: {
      baseUrl: string;
      apiKey: string | undefined;
      provider: GatewayProviderId;
      availableModels?: string[];
      modeDefaults?: { build?: string; plan?: string; fast?: string };
    },
    modelId: string,
  ) => Promise<unknown> | unknown;
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
  onPlanReady?: (plan: string, toolCallId?: string, title?: string) => void;
  onPlanWait?: () => Promise<PlanReviewAction>;
  onOMObservation?: (tokensObserved: number, observationTokens: number) => void;
  onOMReflection?: (compressedTokens: number) => void;
  onAskQuestion?: (questionId: string, question: string, options: AskQuestionOption[] | undefined, respond: (answer: HarnessQuestionAnswer) => void, selectionMode?: HarnessQuestionSelectionMode) => void;
  onToolApproval?: (pendingApproval: NonNullable<HarnessDisplayState["pendingApproval"]>, respond: (decision: "approve" | "decline" | "always_allow_category") => void) => void;
  onPhaseStart?: (phase: AgentPhase, model: string) => void;
  /** Tri-state mode: "build" (default), "plan" (read-only), "fast" (speed). */
  mode?: "build" | "plan" | "fast";
  signal?: AbortSignal;
  imageFiles?: Array<{ data: string; mimeType: string; filename?: string }>;
  /** Injectable host-specific dependencies for the harness lifecycle. */
  deps?: HarnessDeps;
}
