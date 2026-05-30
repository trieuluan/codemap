// Shared types for cli-runtime and mastra-harness-runtime.
// Extracted here to break the circular dependency between the two files.

import type { NineRouterProvider } from "../../core/provider.js";
import type { ChatMessage, TokenUsage } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp-tools/mcp-tool-client.js";
import type { AskQuestionOption, HarnessQuestionAnswer, HarnessQuestionSelectionMode } from "./events.js";

export type ChatUiMode = "tui";

export type AgentPhase = "planning" | "executing";
export type PlanReviewAction = "apply" | "cancel" | string;

export interface SingleAgentRuntimeInput {
  provider: NineRouterProvider;
  model: string;
  /** Real model IDs from the gateway — used to resolve profile aliases like "coder". */
  availableModels?: string[];
  /** Combo IDs from the gateway — passed through without model resolution. */
  availableCombos?: string[];
  agentInstructions?: string;
  userMessage: ChatMessage;
  toolClient: CodeMapMcpToolClient;
  onToken?: (text: string) => void;
  /** Called when an intermediate agent message completes (before more tool calls follow). */
  onStreamReset?: () => void;
  onModel?: (model: string) => void;
  onToolStart?: (name: string, args: string, id: string, preview?: string) => void;
  onToolResult?: (name: string, result: string, id?: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  onPlanReady?: (plan: string) => void;
  onPlanWait?: () => Promise<PlanReviewAction>;
  onOMObservation?: (tokensObserved: number, observationTokens: number) => void;
  onOMReflection?: (compressedTokens: number) => void;
  onAskQuestion?: (questionId: string, question: string, options: AskQuestionOption[] | undefined, respond: (answer: HarnessQuestionAnswer) => void, selectionMode?: HarnessQuestionSelectionMode) => void;
  signal?: AbortSignal;
  imageFiles?: Array<{ data: string; mimeType: string }>;
  effort?: "low" | "medium" | "high";
}

export interface MultiPhaseLoopInput {
  provider: NineRouterProvider;
  model: string;
  availableModels?: string[];
  availableCombos?: string[];
  agentInstructions?: string;
  onStreamReset?: () => void;
  userMessage: ChatMessage;
  toolClient: CodeMapMcpToolClient;
  onPhaseStart?: (phase: AgentPhase, model: string) => void;
  onPlanReady?: (plan: string) => void;
  onPlanWait?: () => Promise<PlanReviewAction>;
  onToken?: (text: string) => void;
  onModel?: (model: string) => void;
  onToolStart?: (name: string, args: string, id: string, preview?: string) => void;
  onToolResult?: (name: string, result: string, id?: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  onOMObservation?: (tokensObserved: number, observationTokens: number) => void;
  onOMReflection?: (compressedTokens: number) => void;
  onAskQuestion?: (questionId: string, question: string, options: AskQuestionOption[] | undefined, respond: (answer: HarnessQuestionAnswer) => void, selectionMode?: HarnessQuestionSelectionMode) => void;
  signal?: AbortSignal;
  imageFiles?: Array<{ data: string; mimeType: string }>;
  effort?: "low" | "medium" | "high";
}
