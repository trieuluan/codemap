import type { EventBus } from "@codemap-ai/core/agent";
import type { Store } from "../../state/store-class.js";
import type {
  AskQuestionOption,
  HarnessQuestionAnswer,
} from "../../../agent/runtime/events.js";
import type { HarnessDisplayState } from "@codemap-ai/runtime-node";

export interface PlanReviewContext {
  bus: EventBus;
  store: Store;
}

// ─── Plan Review ─────────────────────────────────────────

let planReviewResolve: ((action: string) => void) | null = null;

/** Called by the multi-phase loop: pause and wait for user plan review. */
export function waitForPlanReview(ctx: PlanReviewContext): Promise<string> {
  return new Promise((resolve) => {
    planReviewResolve = resolve;
    ctx.store.dispatch({
      planReview: { active: true, selection: 0, reviseMode: false },
    });
    ctx.bus.scheduleRefresh();
  });
}

/** Called by the UI when user makes a plan review decision. */
export function resolvePlanReview(
  ctx: PlanReviewContext,
  action: string,
): void {
  planReviewResolve?.(action);
  planReviewResolve = null;
  ctx.store.dispatch({
    planReview: { active: false, selection: 0, reviseMode: false },
    planContent: null,
  });
  ctx.bus.scheduleRefresh();
}

// ─── Ask Question ────────────────────────────────────────

let askQuestionResolve:
  | ((answer: HarnessQuestionAnswer) => void)
  | null = null;

/** Called by the multi-phase/single loop: pause and wait for user to answer ask_user question. */
export function waitForAskQuestion(
  ctx: PlanReviewContext,
  questionId: string,
  question: string,
  options?: AskQuestionOption[],
  selectionMode?: "single_select" | "multi_select",
): Promise<HarnessQuestionAnswer> {
  return new Promise((resolve) => {
    askQuestionResolve = resolve;
    ctx.store.dispatch({
      askQuestion: {
        questionId,
        question,
        options,
        selection: 0,
        selectionMode:
          selectionMode ?? (options?.length ? "single_select" : undefined),
        selected: [],
      },
    });
    ctx.bus.scheduleRefresh();
  });
}

/** Called by the UI when user answers the ask_user question. */
export function resolveAskQuestion(
  ctx: PlanReviewContext,
  answer: HarnessQuestionAnswer,
): void {
  askQuestionResolve?.(answer);
  askQuestionResolve = null;
  ctx.store.dispatch({ askQuestion: null });
  ctx.bus.scheduleRefresh();
}

/** Cancel any pending plan review or ask question prompts. */
export function cancelPendingPrompts(): {
  canceledPrompt: string | null;
} {
  planReviewResolve?.("cancel");
  planReviewResolve = null;
  askQuestionResolve?.("(skipped)");
  askQuestionResolve = null;
  toolApprovalResolve?.("decline");
  toolApprovalResolve = null;
  return { canceledPrompt: null };
}

// ─── Tool Approval ───────────────────────────────────────

type ToolApprovalDecision = "approve" | "decline" | "always_allow_category";

let toolApprovalResolve:
  | ((decision: ToolApprovalDecision) => void)
  | null = null;

/** Called by the harness bridge: pause and wait for user to approve/decline a tool. */
export function waitForToolApproval(
  ctx: PlanReviewContext,
  pendingApproval: NonNullable<HarnessDisplayState["pendingApproval"]>,
): Promise<ToolApprovalDecision> {
  return new Promise((resolve) => {
    toolApprovalResolve = resolve;
    ctx.store.dispatch({
      toolApproval: {
        ...pendingApproval,
        selection: 0,
      },
    });
    ctx.bus.scheduleRefresh();
  });
}

/** Called by the UI when user makes a tool approval decision. */
export function resolveToolApproval(
  ctx: PlanReviewContext,
  decision: ToolApprovalDecision,
): void {
  toolApprovalResolve?.(decision);
  toolApprovalResolve = null;
  ctx.store.dispatch({ toolApproval: null });
  ctx.bus.scheduleRefresh();
}

export function restorePendingPrompts(
  ctx: PlanReviewContext,
  displayState: HarnessDisplayState | null | undefined,
): void {
  ctx.store.dispatch({
    askQuestion: displayState?.pendingQuestion
      ? {
          ...displayState.pendingQuestion,
          selection: 0,
          selected: [],
          selectionMode:
            displayState.pendingQuestion.selectionMode ??
            (displayState.pendingQuestion.options?.length ? "single_select" : undefined),
        }
      : null,
    toolApproval: displayState?.pendingApproval
      ? {
          ...displayState.pendingApproval,
          selection: 0,
        }
      : null,
  });
  ctx.bus.scheduleRefresh();
}
