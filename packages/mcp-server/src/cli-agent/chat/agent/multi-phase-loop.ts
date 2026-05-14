import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, TokenUsage } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import type { ContextCompactor } from "./context-compactor.js";
import { runAgentLoop, type AgentLoopResult, type ConfirmEditFn } from "./agent-loop.js";

const PLAN_SYSTEM_PROMPT = `You are a coding task planner. Analyze the user's request and produce a concise action plan.

Output format (markdown):
## Task
<1-line summary>

## Steps
1. <step>
2. <step>

## Key areas
- <file, module, or area>

## Risk
<low|medium|high> — <brief reason if medium or high>

Rules: max 15 lines. Do NOT implement anything. Do NOT explain — just write the plan.`;

const REVIEW_SYSTEM_PROMPT = `You are a code reviewer for a coding assistant. Given the original task, the plan, and the execution result, write a brief review.

Cover:
1. Was the task completed correctly?
2. Any missed steps or edge cases?
3. Remaining risks or follow-up actions?

Rules: max 8 lines. Be direct and concise.`;

export type AgentPhase = "planning" | "executing" | "reviewing";

export interface MultiPhaseLoopInput {
  provider: NineRouterProvider;
  plannerModel: string;
  coderModel: string;
  reviewerModel: string;
  history: ChatMessage[];
  userMessage: ChatMessage;
  toolClient: CodeMapMcpToolClient;
  onPhaseStart?: (phase: AgentPhase, model: string) => void;
  onPlanReady?: (plan: string) => void;
  onToken?: (text: string) => void;
  onModel?: (model: string) => void;
  onToolStart?: (name: string, args: string, id: string) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  debug?: boolean;
  signal?: AbortSignal;
  compactor?: ContextCompactor;
  confirmEdit?: ConfirmEditFn;
}

export async function runMultiPhaseAgentLoop(input: MultiPhaseLoopInput): Promise<AgentLoopResult> {
  throwIfAborted(input.signal);

  // ── Phase 1: Plan (planner decides mode) ─────────────────────────────────
  input.onPhaseStart?.("planning", input.plannerModel);
  const planText = await streamToText(
    input.provider,
    input.plannerModel,
    PLAN_SYSTEM_PROMPT,
    [...input.history, input.userMessage],
    input.signal,
    input.onUsage,
    undefined,
    input.onModel,
  );
  throwIfAborted(input.signal);
  input.onPlanReady?.(planText);

  // ── Phase 2: Execute ──────────────────────────────────────────────────────
  input.onPhaseStart?.("executing", input.coderModel);

  const historyWithPlan: ChatMessage[] = [
    ...input.history,
    { role: "system", content: `[Task Plan]\n${planText}` },
  ];

  const execResult = await runAgentLoop({
    provider: input.provider,
    model: input.coderModel,
    history: historyWithPlan,
    userMessage: input.userMessage,
    toolClient: input.toolClient,
    onToken: input.onToken,
    onModel: input.onModel,
    onToolStart: input.onToolStart,
    onToolResult: input.onToolResult,
    onUsage: input.onUsage,
    onDebug: input.onDebug,
    debug: input.debug,
    signal: input.signal,
    compactor: input.compactor,
    confirmEdit: input.confirmEdit,
  });
  throwIfAborted(input.signal);

  // Skip review for pure Q&A (no tools used)
  if (!execResult.usedTools) {
    return execResult;
  }

  // ── Phase 3: Review ───────────────────────────────────────────────────────
  input.onPhaseStart?.("reviewing", input.reviewerModel);
  const reviewContext = buildReviewContext(input.userMessage.content, planText, execResult);
  const reviewText = await streamToText(
    input.provider,
    input.reviewerModel,
    REVIEW_SYSTEM_PROMPT,
    [{ role: "user", content: reviewContext }],
    input.signal,
    input.onUsage,
    input.onToken,
    input.onModel,
  );

  return {
    text: reviewText,
    messages: [
      ...execResult.messages,
      { role: "assistant", content: reviewText },
    ],
    usedTools: true,
    unsupportedToolCalling: execResult.unsupportedToolCalling,
    usage: execResult.usage,
  };
}

function buildReviewContext(task: string, plan: string, execResult: AgentLoopResult): string {
  const toolCount = execResult.messages.filter((m) => m.role === "tool").length;
  return [
    "## Original task",
    task,
    "",
    "## Plan",
    plan,
    "",
    "## Execution result",
    execResult.text,
    `(${toolCount} tool call${toolCount !== 1 ? "s" : ""} made)`,
  ].join("\n");
}

async function streamToText(
  provider: NineRouterProvider,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
  signal: AbortSignal | undefined,
  onUsage?: (usage: TokenUsage) => void,
  onToken?: (text: string) => void,
  onModel?: (model: string) => void,
): Promise<string> {
  let text = "";
  for await (const chunk of provider.stream({ model, system: systemPrompt, messages, signal })) {
    throwIfAborted(signal);
    if (chunk.model) onModel?.(chunk.model);
    if (chunk.text) {
      text += chunk.text;
      onToken?.(chunk.text);
    }
    if (chunk.usage) onUsage?.(chunk.usage);
  }
  return text;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const err = new Error("Task canceled.");
    err.name = "AbortError";
    throw err;
  }
}
