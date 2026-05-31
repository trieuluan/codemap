import { buildToolPreview } from "./tool-approval-policy.js";
import type {
  HarnessThread,
  HarnessMessage,
  HarnessMessageContent,
  HarnessQuestionOption,
  HarnessRequestContext,
  HarnessQuestionAnswer,
  HarnessQuestionSelectionMode,
  HarnessEvent,
  HarnessDisplayState,
} from "@mastra/core/harness";
export type { HarnessThread, HarnessMessage, HarnessMessageContent };
export type { HarnessQuestionOption as AskQuestionOption };
export type { HarnessRequestContext, HarnessQuestionAnswer };
export type { HarnessQuestionSelectionMode };
export type { HarnessEvent };
export type { HarnessDisplayState };

interface Ref<T> {
  get(): T;
  set(v: T): void;
}

export interface BridgeCallbacks {
  onToken?: (t: string) => void;
  onStreamReset?: () => void;
  onToolStart?: (
    name: string,
    args: string,
    id: string,
    preview?: string,
  ) => void;
  onToolResult?: (name: string, result: string, id?: string) => void;
  onUsage?: (u: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  onOMObservation?: (tokensObserved: number, observationTokens: number) => void;
  onOMReflection?: (compressedTokens: number) => void;
  onAskQuestion?: (
    questionId: string,
    question: string,
    options: HarnessQuestionOption[] | undefined,
    respond: (answer: HarnessQuestionAnswer) => void,
    selectionMode?: "single_select" | "multi_select",
  ) => void;
  harness: HarnessLike;
  currentStreamTextRef: Ref<string>;
  finalTextRef: Ref<string>;
  usedToolsRef: Ref<boolean>;
  onMessageStart?: (createdAt: number) => void;
  onPlanApproval?: (planId: string, plan: string) => void;
  onEnd: (
    usage:
      | { promptTokens: number; completionTokens: number; totalTokens: number }
      | undefined,
  ) => void;
  onError: (err: unknown) => void;
  mcpServerIds?: Set<string>;
}

export function summarizeHarnessEvent(
  event: HarnessEvent,
  currentStreamText: string,
  finalText: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    event: "mastra_harness_event",
    type: event.type,
    currentStreamTextLength: currentStreamText.length,
    finalTextLength: finalText.length,
  };

  if (event.type === "message_update" || event.type === "message_end") {
    const message = event.message;
    const content = message?.role === "assistant" ? message.content : undefined;
    const lastText = extractLastText(content);
    return {
      ...base,
      role: message?.role,
      textLength: lastText.length,
      textPreview: previewText(lastText),
      contentShape: describeMessageContent(content),
    };
  }

  if (event.type === "tool_start") {
    return { ...base, toolName: event.toolName, toolCallId: event.toolCallId };
  }

  if (event.type === "tool_end") {
    return {
      ...base,
      toolCallId: event.toolCallId,
      isError: event.isError,
      resultType: typeof event.result,
    };
  }

  if (event.type === "agent_end") {
    return { ...base, reason: event.reason };
  }

  if (event.type === "error") {
    const err = event.error;
    return {
      ...base,
      errorName: err?.name,
      errorMessage: err?.message ?? String(err),
    };
  }

  if (event.type === "mode_changed") {
    return { ...base, modeId: event.modeId, previousModeId: event.previousModeId };
  }

  return base;
}

export function bridgeCommonEvent(
  event: HarnessEvent,
  cb: BridgeCallbacks,
): void {
  if (event.type === "message_start") {
    const message = event.message;
    if (message?.role === "assistant" && message.createdAt) {
      const ts = message.createdAt instanceof Date
        ? message.createdAt.getTime()
        : new Date(message.createdAt).getTime();
      cb.onMessageStart?.(ts);
    }
    return;
  }

  if (event.type === "message_update") {
    const message = event.message;
    if (message?.role !== "assistant") return;
    const lastText = extractLastText(message.content);
    const prev = cb.currentStreamTextRef.get();

    if (lastText.length < prev.length) {
      // The last text part got shorter: a new text part started in a new agent iteration.
      cb.currentStreamTextRef.set("");
      cb.onStreamReset?.();
    }

    const tracked = cb.currentStreamTextRef.get();
    if (lastText.length > tracked.length) {
      const delta = lastText.slice(tracked.length);
      cb.currentStreamTextRef.set(lastText);
      if (delta) cb.onToken?.(delta);
    }

    return;
  }

  if (event.type === "message_end") {
    const message = event.message;
    if (message?.role !== "assistant") return;
    const lastText = extractLastText(message.content);
    cb.finalTextRef.set(lastText);
    cb.currentStreamTextRef.set("");
    cb.onStreamReset?.();
    return;
  }

  if (event.type === "tool_start") {
    cb.usedToolsRef.set(true);
    const displayName = formatToolDisplayName(event.toolName, cb.mcpServerIds);
    const args = normalizeToolArgs(event.args);
    cb.onToolStart?.(
      displayName,
      event.args != null ? JSON.stringify(event.args) : "{}",
      event.toolCallId ?? "",
      buildToolPreview(event.toolName, args),
    );
    return;
  }

  if (event.type === "tool_end") {
    const r = formatToolResult(event.result);
    const content =
      r.trim() ||
      (event.isError
        ? "Tool failed without a result."
        : "Tool completed without a result.");
    cb.onToolResult?.(
      event.toolCallId,
      event.isError ? `[ERROR] ${content}` : content,
      event.toolCallId,
    );
    return;
  }

  if (event.type === "tool_approval_required") {
    cb.harness.respondToToolApproval?.({ decision: "approve" });
    return;
  }

  if (event.type === "plan_approval_required") {
    cb.onPlanApproval?.(event.planId, event.plan);
    return;
  }

  if (event.type === "ask_question") {
    const respond = (answer: HarnessQuestionAnswer) =>
      cb.harness.respondToQuestion?.({ questionId: event.questionId, answer });
    cb.onAskQuestion?.(
      event.questionId,
      event.question,
      event.options,
      respond,
      event.selectionMode,
    );
    return;
  }

  if (event.type === "om_observation_end") {
    cb.onOMObservation?.(event.tokensObserved ?? 0, event.observationTokens ?? 0);
    return;
  }

  if (event.type === "om_reflection_end") {
    cb.onOMReflection?.(event.compressedTokens ?? 0);
    return;
  }

  if (event.type === "error") {
    cb.onError(event.error);
    return;
  }

  if (event.type === "agent_end") {
    const raw = cb.harness.getTokenUsage?.();
    const usage = raw
      ? {
          promptTokens: raw.promptTokens ?? 0,
          completionTokens: raw.completionTokens ?? 0,
          totalTokens: raw.totalTokens ?? 0,
        }
      : undefined;
    if (usage) cb.onUsage?.(usage);
    cb.onDebug?.({
      event: "mastra_harness_end",
      reason: event.type === "agent_end" ? event.reason : undefined,
      usedTools: cb.usedToolsRef.get(),
    });
    cb.onEnd(usage);
  }
}

function formatToolDisplayName(
  name: string,
  mcpServerIds?: Set<string>,
): string {
  if (!name) return name ?? "";
  if (!mcpServerIds) return name;
  const underscoreIdx = name.indexOf("_");
  if (underscoreIdx > 0) {
    const server = name.slice(0, underscoreIdx);
    if (mcpServerIds.has(server))
      return `${server} · ${name.slice(underscoreIdx + 1)}`;
  }
  return name;
}

function describeMessageContent(
  content: HarnessMessageContent[] | string | undefined,
): unknown {
  if (!content) return "empty";
  if (typeof content === "string")
    return { kind: "string", length: content.length };
  return content.map((part) => ({
    type: part.type,
    textLength:
      part.type === "text"
        ? (part as { type: "text"; text: string }).text.length
        : undefined,
  }));
}

function previewText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 160)}…` : compact;
}

function extractLastText(
  content: HarnessMessageContent[] | string | undefined,
): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  for (let i = content.length - 1; i >= 0; i--) {
    if (content[i].type === "text") {
      return (content[i] as { type: "text"; text: string }).text;
    }
  }
  return "";
}

function normalizeToolArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  return {};
}

function formatToolResult(result: unknown): string {
  const text = extractToolResultText(result);
  if (text.trim()) return text;
  return safeJsonStringify(result).trim();
}

function extractToolResultText(
  value: unknown,
  seen = new Set<unknown>(),
): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  )
    return String(value);
  if (typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => extractToolResultText(item, seen))
      .filter(Boolean)
      .join("\n");
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "text",
    "content",
    "message",
    "error",
    "stdout",
    "stderr",
    "output",
  ];
  for (const key of preferredKeys) {
    const text = extractToolResultText(record[key], seen);
    if (text.trim()) return text;
  }

  return "";
}

function safeJsonStringify(value: unknown): string {
  if (value == null) return "";
  try {
    const json = JSON.stringify(value, null, 2);
    return typeof json === "string" ? json : "";
  } catch {
    return String(value);
  }
}

export interface HarnessLike {
  init(): Promise<void>;
  selectOrCreateThread(): Promise<unknown>;
  createThread(opts?: { title?: string }): Promise<unknown>;
  getCurrentThreadId?(): string | null;
  getDisplayState?(): Readonly<HarnessDisplayState>;
  listMessages(options?: { limit?: number }): Promise<HarnessMessage[]>;
  listMessagesForThread(options: {
    threadId: string;
    limit?: number;
  }): Promise<HarnessMessage[]>;
  listThreads(options?: {
    includeForkedSubagents?: boolean;
  }): Promise<HarnessThread[]>;
  switchThread(options: { threadId: string }): Promise<void>;
  getCurrentModelId?(): string;
  getTokenUsage?():
    | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    | undefined;
  setState?(updates: Record<string, unknown>): Promise<void>;
  subscribe(listener: (event: HarnessEvent) => void): () => void;
  sendSignal?(input: {
    content?:
      | string
      | {
          role: string;
          content: Array<{ type: string; [key: string]: unknown }>;
        };
    type?: string;
    contents?: string;
    [key: string]: unknown;
  }): {
    id: string;
    type: string;
    accepted: Promise<{ accepted?: boolean; runId?: string | null }>;
  };
  sendMessage(input: {
    content: string;
    files?: Array<{ data: string; mediaType: string }>;
  }): Promise<void>;
  abort?(): void;
  switchMode?(input: { modeId: string }): Promise<void>;
  switchModel?(input: {
    modelId: string;
    scope?: "global" | "thread";
  }): Promise<void>;
  respondToPlanApproval?(input: {
    planId: string;
    response: { action: "approved" | "rejected"; feedback?: string };
  }): Promise<void>;
  respondToQuestion?(input: {
    questionId: string;
    answer: HarnessQuestionAnswer;
  }): void;
  respondToToolApproval?(input: {
    decision: "approve" | "decline" | "always_allow_category";
  }): void;
  destroy?(): Promise<void>;
}


