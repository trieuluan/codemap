import type { HarnessThread } from "@mastra/core/harness";
import type { TokenUsage } from "../types.ts";

export interface SessionMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool" | "tool_call";
  content: string;
  createdAt?: string;
  toolCallId?: string;
  name?: string;
}

export interface ThreadSummary {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  tokenUsage?: HarnessThread["tokenUsage"];
  metadata?: Record<string, unknown>;
}

export interface ThreadSessionData {
  threadId: string;
  messages: SessionMessage[];
  tokenUsage?: TokenUsage;
}

export interface ThreadChangePayload {
  threadId: string;
  messages: SessionMessage[];
  tokenUsage?: TokenUsage;
  /** Raw system prompt text — used by UI to estimate System token bucket. */
  systemPrompt?: string;
}

export interface ToolCallState {
  toolCallId: string;
  name: string;
  args: string;
  preview?: string;
  result?: string;
  isError?: boolean;
}

export interface ApprovalRequest {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface QuestionOption {
  label: string;
  description?: string;
  value?: string;
}

export interface QuestionRequest {
  questionId: string;
  question: string;
  options?: QuestionOption[];
  selectionMode?: "single_select" | "multi_select";
}

export type SessionStatus =
  | "idle"
  | "running"
  | "aborting"
  | "disconnected"
  | "error";

export interface SessionSnapshot {
  threadId: string | null;
  messages: SessionMessage[];
  status: SessionStatus;
  streamingText: string;
  thinkingText: string;
  tools: ToolCallState[];
  pendingApproval: ApprovalRequest | null;
  pendingQuestion: QuestionRequest | null;
  usage: TokenUsage;
  threadUsage: TokenUsage | null;
  model: string | null;
  error: string | null;
  /** System prompt text preserved for token attribution estimation. */
  systemPrompt?: string;
}

export interface SendMessageInput {
  requestId: string;
  content: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  planMode?: boolean;
  images?: Array<{ data: string; mimeType: string; filename?: string }>;
}

export interface ApprovalResponse {
  requestId: string;
  approvalId: string;
  decision: "approve" | "decline" | "always_allow_category";
}

export interface QuestionResponse {
  requestId: string;
  questionId: string;
  answer: string | string[];
}

export type AgentSessionEvent =
  | { type: "snapshot"; snapshot: SessionSnapshot }
  | { type: "status"; requestId?: string; status: SessionStatus }
  | { type: "token"; requestId: string; text: string }
  | { type: "thinking"; requestId: string; text: string }
  | { type: "model"; requestId?: string; model: string }
  | {
      type: "tool_start";
      requestId: string;
      toolCallId: string;
      name: string;
      args: string;
      preview?: string;
    }
  | {
      type: "tool_result";
      requestId: string;
      toolCallId: string;
      result: string;
      isError: boolean;
    }
  | { type: "approval"; requestId: string; approval: ApprovalRequest }
  | {
      type: "approval_resolved";
      requestId: string;
      approvalId: string;
    }
  | { type: "question"; requestId: string; question: QuestionRequest }
  | {
      type: "question_resolved";
      requestId: string;
      questionId: string;
    }
  | { type: "usage"; requestId?: string; usage: TokenUsage }
  | ({ type: "thread_change" } & ThreadChangePayload)
  | { type: "error"; requestId?: string; message: string };

export type AgentSessionCommand =
  | { type: "send"; requestId: string; input: Omit<SendMessageInput, "requestId"> }
  | { type: "abort"; requestId: string }
  | { type: "list_threads"; requestId: string }
  | { type: "switch_thread"; requestId: string; threadId: string }
  | { type: "new_thread"; requestId: string }
  | { type: "delete_thread"; requestId: string; threadId: string }
  | { type: "respond_approval"; requestId: string; response: ApprovalResponse }
  | { type: "respond_question"; requestId: string; response: QuestionResponse };

export interface AgentSessionController {
  send(input: SendMessageInput): Promise<void>;
  abort(): void;
  listThreads(): Promise<ThreadSummary[]>;
  switchThread(threadId: string): Promise<SessionSnapshot>;
  deleteThread(threadId: string): Promise<void>;
  respondToApproval(input: ApprovalResponse): void;
  respondToQuestion(input: QuestionResponse): void;
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
}
