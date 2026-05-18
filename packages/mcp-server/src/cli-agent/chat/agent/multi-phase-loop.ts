import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, TokenUsage } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import type { ContextCompactor } from "./context-compactor.js";
import { runAgentLoop, WORKFLOW_TOOLS, type AgentLoopResult, type ConfirmEditFn } from "./agent-loop.js";

// Tools the planner must never call — write tools + bash (not inherently read-only).
const PLANNER_BLOCKED_TOOLS = new Set([
  "edit_file", "write_file", "apply_patch", "move_symbols", "rename_symbol",
  "bash",
  "get_working_diff", // avoid stale uncommitted work from prior tasks confusing planner
  ...WORKFLOW_TOOLS,
]);

const PLAN_SYSTEM_PROMPT = `You are a coding task planner with access to read-only tools.

Process:
1. Use tools (get_file, search_codebase, find_related_files, explore_task, find_usages...) to read and understand the relevant code.
2. After exploring, write a concrete plan based on what you actually found.

Output format (after exploration):
## Task
<1-line summary>

## Steps
1. <specific file path + what to change>
2. <specific file path + what to change>

## Key areas
- <file path or module>

## Risk
<low|medium|high> — <brief reason>

Rules:
- Steps must name specific source files and describe the exact change.
- Do NOT create documentation or markdown plan files as deliverables.
- Do NOT implement anything — explore then plan only.
- Max 20 lines for the plan.`;

const REVIEW_SYSTEM_PROMPT = `You are a code reviewer for a coding assistant. Given the original task, the plan, and the execution result, write a brief review.

Cover:
1. Was the task completed correctly?
2. Any missed steps or edge cases?
3. Remaining risks or follow-up actions?

Rules: max 8 lines. Be direct and concise.`;

export type AgentPhase = "planning" | "executing" | "reviewing";

// Return value from onPlanWait:
//   "implement" → proceed to coder
//   "cancel"    → abort the whole loop
//   <any string> → feedback to send back to the planner for revision
export type PlanReviewAction = "implement" | "cancel" | string;

export interface MultiPhaseLoopInput {
  provider: NineRouterProvider;
  coderModel: string;
  reviewerModel: string;
  history: ChatMessage[];
  userMessage: ChatMessage;
  toolClient: CodeMapMcpToolClient;
  onPhaseStart?: (phase: AgentPhase, model: string) => void;
  onPlanReady?: (plan: string) => void;
  /** Called after plan is shown. Resolves with the user's review action. */
  onPlanWait?: () => Promise<PlanReviewAction>;
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

/** Strip orphaned tool messages from history before sending to any provider. */
function cleanHistoryForStream(history: ChatMessage[], userMessage: ChatMessage): ChatMessage[] {
  return [
    ...history
      .filter((m) => m.role !== "tool")
      .flatMap((m) => {
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
          const { toolCalls: _dropped, ...rest } = m;
          if (!rest.content?.trim()) return [];
          return [rest];
        }
        return [m];
      }),
    userMessage,
  ];
}

export async function runMultiPhaseAgentLoop(input: MultiPhaseLoopInput): Promise<AgentLoopResult> {
  throwIfAborted(input.signal);

  const cleanedHistory = cleanHistoryForStream(input.history, input.userMessage);

  // ── Phase 1: Plan — explore codebase with read-only tools, then write plan ──
  input.onPhaseStart?.("planning", input.coderModel);
  const planResult = await runAgentLoop({
    provider: input.provider,
    model: input.coderModel,
    history: cleanedHistory.slice(0, -1), // history without userMessage
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
    excludeTools: PLANNER_BLOCKED_TOOLS,
    systemContext: `## Current Task (user-provided)\n\n<task>\n${input.userMessage.content}\n</task>\n\nFocus only on this task. Do not resume or complete any previous unfinished work unless it directly relates to this request.\n\n${PLAN_SYSTEM_PROMPT}`,
  });
  throwIfAborted(input.signal);
  const planText = planResult.text;
  input.onPlanReady?.(planText);

  // ── Plan review: wait for user to approve, cancel, or provide feedback ────
  const IMPLEMENT_SYNONYMS = new Set([
    "implement", "ok", "okay", "yes", "y", "go", "proceed", "sure", "do it", "done",
    "ừ", "ừm", "đồng ý", "được", "làm đi", "làm luôn", "tiếp tục", "ok luôn",
  ]);
  const CANCEL_SYNONYMS = new Set([
    "cancel", "no", "n", "stop", "abort", "quit", "exit",
    "không", "thôi", "dừng", "hủy",
  ]);

  const normalizeAction = (a: string): string => {
    const lower = a.trim().toLowerCase();
    if (IMPLEMENT_SYNONYMS.has(lower)) return "implement";
    if (CANCEL_SYNONYMS.has(lower)) return "cancel";
    return a;
  };

  let activePlanText = planText;
  if (input.onPlanWait) {
    let action = normalizeAction(await input.onPlanWait());
    throwIfAborted(input.signal);

    // Re-plan loop: keep revising until user approves or cancels
    while (action !== "implement" && action !== "cancel") {
      const feedback = action;
      input.onPhaseStart?.("planning", input.coderModel);
      const revisedResult = await runAgentLoop({
        provider: input.provider,
        model: input.coderModel,
        history: [
          ...cleanedHistory.slice(0, -1),
          { role: "assistant" as const, content: activePlanText },
        ],
        userMessage: { role: "user", content: `Feedback on the plan: ${feedback}. Revise the plan accordingly.` },
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
        excludeTools: PLANNER_BLOCKED_TOOLS,
        systemContext: PLAN_SYSTEM_PROMPT,
      });
      throwIfAborted(input.signal);
      activePlanText = revisedResult.text;
      input.onPlanReady?.(activePlanText);
      action = normalizeAction(await input.onPlanWait());
      throwIfAborted(input.signal);
    }

    if (action === "cancel") {
      return {
        text: "Plan cancelled.",
        messages: [],
        usedTools: false,
        unsupportedToolCalling: false,
      };
    }
  }

  // ── Phase 2: Execute ──────────────────────────────────────────────────────
  input.onPhaseStart?.("executing", input.coderModel);

  const historyWithPlan: ChatMessage[] = [
    ...input.history,
    {
      role: "system",
      content:
        `[APPROVED PLAN — EXECUTE NOW]\n${activePlanText}\n\n` +
        `The plan above has been reviewed and approved by the user. ` +
        `IMPLEMENT IT NOW using file-editing tools:\n` +
        `- edit_file: modify existing files\n` +
        `- write_file: create new files only\n` +
        `- bash: run build/test commands to verify — NOT for editing files\n\n` +
        `HARD RULES — do NOT do any of these:\n` +
        `- Do NOT call get_agent_workflow, recommend_agent_workflow, or explore_task\n` +
        `- Do NOT generate another plan or outline\n` +
        `- Do NOT explain what you are about to do\n` +
        `- Do NOT ask for permission or confirmation\n` +
        `- Do NOT run ls/rg/find to explore — the plan already defines what to change\n\n` +
        `Start executing step 1 of the plan immediately with edit_file or write_file.`,
    },
  ];

  // Replace the original user message with a clear execute directive so the coder
  // does not re-plan when the original message contained words like "plan" or "implement".
  const executeUserMessage: ChatMessage = {
    role: "user",
    content: "Execute the approved plan above step by step using edit_file and write_file. Start immediately.",
  };

  const execResult = await runAgentLoop({
    provider: input.provider,
    model: input.coderModel,
    history: historyWithPlan,
    userMessage: executeUserMessage,
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
    excludeTools: WORKFLOW_TOOLS,
  });
  throwIfAborted(input.signal);

  // Skip review for pure Q&A (no tools used)
  if (!execResult.usedTools) {
    return execResult;
  }

  // ── Phase 3: Review ───────────────────────────────────────────────────────
  input.onPhaseStart?.("reviewing", input.reviewerModel);
  const reviewContext = buildReviewContext(input.userMessage.content, activePlanText, execResult);
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
