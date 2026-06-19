import type {
  AgentSessionController,
  AgentSessionEvent,
  ApprovalResponse,
  PlanReviewResponse,
  QuestionResponse,
  SendMessageInput,
  SessionSnapshot,
  ThreadSessionData,
  ThreadSummary,
} from "../contracts/index.ts";
import {
  createInitialSessionSnapshot,
  reduceAgentSessionEvent,
} from "./reducer.ts";

export interface AgentSessionDriver {
  send(
    input: SendMessageInput,
    emit: (event: AgentSessionEvent) => void,
  ): Promise<void>;
  abort(): void;
  listThreads(): Promise<ThreadSummary[]>;
  switchThread(threadId: string): Promise<ThreadSessionData>;
  deleteThread(threadId: string): Promise<void>;
  respondToApproval(input: ApprovalResponse): void;
  respondToQuestion(input: QuestionResponse): void;
  respondToPlanReview(input: PlanReviewResponse): void;
  /** Returns the current system prompt text for token attribution. */
  getSystemPrompt?(): string | undefined;
}

export function createAgentSessionController(
  driver: AgentSessionDriver,
  initialSnapshot = createInitialSessionSnapshot(),
): AgentSessionController {
  let snapshot = initialSnapshot;
  let activeRequestId: string | null = null;
  const listeners = new Set<(event: AgentSessionEvent) => void>();

  const emit = (event: AgentSessionEvent) => {
    snapshot = reduceAgentSessionEvent(snapshot, event);
    for (const listener of listeners) listener(event);
  };

  return {
    async send(input) {
      if (activeRequestId) {
        throw new Error(`Agent session is already running request ${activeRequestId}`);
      }
      activeRequestId = input.requestId;
      emit({ type: "status", requestId: input.requestId, status: "running" });
      try {
        await driver.send(input, emit);
        emit({ type: "status", requestId: input.requestId, status: "idle" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit({ type: "error", requestId: input.requestId, message });
        throw error;
      } finally {
        activeRequestId = null;
      }
    },
    abort() {
      if (activeRequestId) {
        emit({
          type: "status",
          requestId: activeRequestId,
          status: "aborting",
        });
      }
      driver.abort();
    },
    listThreads() {
      return driver.listThreads();
    },
    async switchThread(threadId) {
      const thread = await driver.switchThread(threadId);
      emit({
        type: "thread_change",
        threadId: thread.threadId,
        messages: thread.messages,
        tokenUsage: thread.tokenUsage,
        systemPrompt: driver.getSystemPrompt?.(),
      });
      return snapshot;
    },
    deleteThread(threadId) {
      return driver.deleteThread(threadId);
    },
    respondToApproval(input) {
      driver.respondToApproval(input);
      emit({
        type: "approval_resolved",
        requestId: input.requestId,
        approvalId: input.approvalId,
      });
    },
    respondToQuestion(input) {
      driver.respondToQuestion(input);
      emit({
        type: "question_resolved",
        requestId: input.requestId,
        questionId: input.questionId,
      });
    },
    respondToPlanReview(input) {
      driver.respondToPlanReview(input);
      emit({
        type: "plan_review_resolved",
        requestId: input.requestId,
        planReviewId: input.planReviewId,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      listener({ type: "snapshot", snapshot });
      return () => listeners.delete(listener);
    },
  };
}
