import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, TokenUsage } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import type { ContextCompactor } from "../agent/context-compactor.js";
import type { AgentLoopResult, ConfirmEditFn, CancelTaskStreamFn } from "../agent/agent-loop.js";
import { runWithMastraHarness, runMultiPhaseWithMastra } from "./mastra-harness-runtime.js";

export type ChatUiMode = "tui" | "classic" | "inline" | "mastra";

export type AgentPhase = "planning" | "executing" | "reviewing";
export type PlanReviewAction = "implement" | "cancel" | string;

export interface SingleAgentRuntimeInput {
  provider: NineRouterProvider;
  model: string;
  history: ChatMessage[];
  userMessage: ChatMessage;
  toolClient: CodeMapMcpToolClient;
  onToken?: (text: string) => void;
  onModel?: (model: string) => void;
  onToolStart?: (name: string, args: string, id: string) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  onRefreshWorkspaceCommits?: () => Promise<void> | void;
  debug?: boolean;
  signal?: AbortSignal;
  compactor?: ContextCompactor;
  confirmEdit?: ConfirmEditFn;
  cancelTaskStream?: CancelTaskStreamFn;
  excludeTools?: Set<string>;
  systemContext?: string;
  resourceContext?: string | null;
  projectContext?: {
    conventions: string | null;
    rules: string | null;
    skills: string | null;
  };
}

export interface MultiPhaseLoopInput {
  provider: NineRouterProvider;
  coderModel: string;
  reviewerModel: string;
  history: ChatMessage[];
  userMessage: ChatMessage;
  toolClient: CodeMapMcpToolClient;
  onPhaseStart?: (phase: AgentPhase, model: string) => void;
  onPlanReady?: (plan: string) => void;
  onPlanWait?: () => Promise<PlanReviewAction>;
  onToken?: (text: string) => void;
  onModel?: (model: string) => void;
  onToolStart?: (name: string, args: string, id: string) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  onRefreshWorkspaceCommits?: () => Promise<void> | void;
  debug?: boolean;
  signal?: AbortSignal;
  compactor?: ContextCompactor;
  confirmEdit?: ConfirmEditFn;
  cancelTaskStream?: CancelTaskStreamFn;
}

export async function runSingleAgentRuntime(
  input: SingleAgentRuntimeInput,
): Promise<AgentLoopResult> {
  return runWithMastraHarness(input);
}

export async function runMultiPhaseAgentRuntime(
  input: MultiPhaseLoopInput,
): Promise<AgentLoopResult> {
  return runMultiPhaseWithMastra(input);
}
