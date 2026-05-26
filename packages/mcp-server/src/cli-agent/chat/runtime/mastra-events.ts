import { buildToolPreview } from "./tool-approval-policy.js";

interface Ref<T> { get(): T; set(v: T): void }

export interface AskQuestionOption {
  label: string;
  description?: string;
}

export interface BridgeCallbacks {
  onToken?: (t: string) => void;
  onStreamReset?: () => void;
  onToolStart?: (name: string, args: string, id: string, preview?: string) => void;
  onToolResult?: (name: string, result: string, id?: string) => void;
  onUsage?: (u: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
  onDebug?: (info: Record<string, unknown>) => void;
  onOMObservation?: (tokensObserved: number, observationTokens: number) => void;
  onOMReflection?: (compressedTokens: number) => void;
  onAskQuestion?: (questionId: string, question: string, options: AskQuestionOption[] | undefined, respond: (answer: string) => void) => void;
  harness: HarnessLike;
  currentStreamTextRef: Ref<string>;
  finalTextRef: Ref<string>;
  usedToolsRef: Ref<boolean>;
  onPlanApproval?: (planId: string, plan: string) => void;
  onEnd: (usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined) => void;
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
    const message = (event as MessageEvent).message;
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
    const ev = event as ToolStartEvent;
    return { ...base, toolName: ev.toolName, toolCallId: ev.toolCallId };
  }

  if (event.type === "tool_end") {
    const ev = event as ToolEndEvent;
    return {
      ...base,
      toolName: ev.toolName,
      toolCallId: ev.toolCallId,
      isError: ev.isError,
      resultType: typeof ev.result,
    };
  }

  if (event.type === "agent_end") {
    return { ...base, reason: (event as AgentEndEvent).reason };
  }

  if (event.type === "error") {
    const err = (event as HarnessErrorEvent).error;
    return {
      ...base,
      errorName: err?.name,
      errorMessage: err?.message ?? String(err),
    };
  }

  if (event.type === "mode_changed") {
    const ev = event as ModeChangedEvent;
    return { ...base, modeId: ev.modeId, previousModeId: ev.previousModeId };
  }

  return base;
}

export function bridgeCommonEvent(event: HarnessEvent, cb: BridgeCallbacks): void {
  if (event.type === "message_update") {
    const message = (event as MessageEvent).message;
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
    const message = (event as MessageEvent).message;
    if (message?.role !== "assistant") return;
    const lastText = extractLastText(message.content);
    cb.finalTextRef.set(lastText);
    cb.currentStreamTextRef.set("");
    cb.onStreamReset?.();
    return;
  }

  if (event.type === "tool_start") {
    const ev = event as ToolStartEvent;
    cb.usedToolsRef.set(true);
    const displayName = formatToolDisplayName(ev.toolName, cb.mcpServerIds);
    const args = normalizeToolArgs(ev.args);
    cb.onToolStart?.(
      displayName,
      ev.args != null ? JSON.stringify(ev.args) : "{}",
      ev.toolCallId ?? "",
      buildToolPreview(ev.toolName, args),
    );
    return;
  }

  if (event.type === "tool_end") {
    const ev = event as ToolEndEvent;
    const displayName = formatToolDisplayName(ev.toolName, cb.mcpServerIds);
    const r = typeof ev.result === "string" ? ev.result : JSON.stringify(ev.result ?? "");
    cb.onToolResult?.(displayName, ev.isError ? `[ERROR] ${r}` : r, ev.toolCallId);
    return;
  }

  if (event.type === "tool_approval_required") {
    cb.harness.respondToToolApproval?.({ decision: "approve" });
    return;
  }

  if (event.type === "plan_approval_required") {
    const ev = event as PlanApprovalEvent;
    cb.onPlanApproval?.(ev.planId, ev.plan);
    return;
  }

  if (event.type === "ask_question") {
    const ev = event as AskQuestionEvent;
    const respond = (answer: string) => cb.harness.respondToQuestion?.({ questionId: ev.questionId, answer });
    cb.onAskQuestion?.(ev.questionId, ev.question, ev.options, respond);
    return;
  }

  if (event.type === "om_observation_end") {
    const ev = event as OMObservationEndEvent;
    cb.onOMObservation?.(ev.tokensObserved ?? 0, ev.observationTokens ?? 0);
    return;
  }

  if (event.type === "om_reflection_end") {
    const ev = event as OMReflectionEndEvent;
    cb.onOMReflection?.(ev.compressedTokens ?? 0);
    return;
  }

  if (event.type === "error") {
    const ev = event as HarnessErrorEvent;
    cb.onError(ev.error);
    return;
  }

  if (event.type === "agent_end") {
    const raw = cb.harness.getTokenUsage?.();
    const usage = raw
      ? { promptTokens: raw.promptTokens ?? 0, completionTokens: raw.completionTokens ?? 0, totalTokens: raw.totalTokens ?? 0 }
      : undefined;
    if (usage) cb.onUsage?.(usage);
    cb.onDebug?.({ event: "mastra_harness_end", reason: (event as AgentEndEvent).reason, usedTools: cb.usedToolsRef.get() });
    cb.onEnd(usage);
  }
}

function formatToolDisplayName(name: string, mcpServerIds?: Set<string>): string {
  if (!name) return name ?? "";
  if (!mcpServerIds) return name;
  const underscoreIdx = name.indexOf("_");
  if (underscoreIdx > 0) {
    const server = name.slice(0, underscoreIdx);
    if (mcpServerIds.has(server)) return `${server} · ${name.slice(underscoreIdx + 1)}`;
  }
  return name;
}

function describeMessageContent(content: HarnessMessageContent[] | string | undefined): unknown {
  if (!content) return "empty";
  if (typeof content === "string") return { kind: "string", length: content.length };
  return content.map((part) => ({
    type: part.type,
    textLength: part.type === "text" ? (part as { type: "text"; text: string }).text.length : undefined,
  }));
}

function previewText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 160)}…` : compact;
}

function extractLastText(content: HarnessMessageContent[] | string | undefined): string {
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

export interface HarnessThread {
  id: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
  tokenUsage?: { totalTokens?: number };
}

export type HarnessMessageContent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown; isError: boolean }
  | { type: 'system_reminder'; message: string }
  | { type: string; [key: string]: unknown };

export interface HarnessMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: HarnessMessageContent[];
  createdAt: Date;
  stopReason?: string;
}

export interface HarnessLike {
  init(): Promise<void>;
  selectOrCreateThread(): Promise<unknown>;
  createThread(opts?: { title?: string }): Promise<unknown>;
  getCurrentThreadId?(): string | null;
  getDisplayState?(): { omProgress?: { observationTokens?: number; status?: string; preReflectionTokens?: number } };
  listMessages(options?: { limit?: number }): Promise<HarnessMessage[]>;
  listMessagesForThread(options: { threadId: string; limit?: number }): Promise<HarnessMessage[]>;
  listThreads(options?: { includeForkedSubagents?: boolean }): Promise<HarnessThread[]>;
  switchThread(options: { threadId: string }): Promise<void>;
  getCurrentModelId?(): string;
  getTokenUsage?(): { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
  setState?(updates: Record<string, unknown>): Promise<void>;
  subscribe(listener: (event: HarnessEvent) => void): () => void;
  sendSignal?(input: { content?: string | { role: string; content: Array<{ type: string; [key: string]: unknown }> }; type?: string; contents?: string; [key: string]: unknown }): {
    id: string;
    type: string;
    accepted: Promise<{ accepted?: boolean; runId?: string | null }>;
  };
  sendMessage(input: { content: string; files?: Array<{ data: string; mediaType: string }> }): Promise<void>;
  abort?(): void;
  switchMode?(input: { modeId: string }): Promise<void>;
  switchModel?(input: { modelId: string; scope?: "global" | "thread" }): Promise<void>;
  respondToPlanApproval?(input: {
    planId: string;
    response: { action: "approved" | "rejected"; feedback?: string };
  }): Promise<void>;
  respondToQuestion?(input: { questionId: string; answer: string }): void;
  respondToToolApproval?(input: { decision: "approve" | "decline" | "always_allow_category" }): void;
  destroy?(): Promise<void>;
}

export interface HarnessEvent { type: string }

interface MessageEvent extends HarnessEvent {
  type: "message_update" | "message_end";
  message: { role?: string; content?: HarnessMessageContent[] | string };
}
interface ToolStartEvent extends HarnessEvent {
  type: "tool_start";
  toolCallId?: string;
  toolName: string;
  args: unknown;
}
interface ToolEndEvent extends HarnessEvent {
  type: "tool_end";
  toolCallId?: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}
interface AgentEndEvent extends HarnessEvent {
  type: "agent_end";
  reason?: string;
}
interface HarnessErrorEvent extends HarnessEvent {
  type: "error";
  error: Error;
}
interface ModeChangedEvent extends HarnessEvent {
  type: "mode_changed";
  modeId: string;
  previousModeId: string;
}
interface PlanApprovalEvent extends HarnessEvent {
  type: "plan_approval_required";
  planId: string;
  title: string;
  plan: string;
}
interface AskQuestionEvent extends HarnessEvent {
  type: "ask_question";
  questionId: string;
  question: string;
  options?: AskQuestionOption[];
}
interface OMObservationEndEvent extends HarnessEvent {
  type: "om_observation_end";
  tokensObserved?: number;
  observationTokens?: number;
  observations?: string;
}
interface OMReflectionEndEvent extends HarnessEvent {
  type: "om_reflection_end";
  compressedTokens?: number;
  observations?: string;
}
