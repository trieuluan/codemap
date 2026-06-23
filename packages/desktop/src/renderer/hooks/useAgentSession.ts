import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialSessionSnapshot,
  reduceAgentSessionEvent,
} from "@codemap-ai/core/agent/session";
import type {
  AgentSessionEvent,
  SessionMessage,
  SessionSnapshot,
  ToolCallState,
} from "@codemap-ai/core/agent/contracts";

export type LocalMessage = {
  localId: string;
  role: "user" | "assistant";
  content: string;
  /** Images attached to a user message */
  images?: Array<{ data: string; mimeType: string; filename?: string }>;
};

export type LocalReasoning = {
  localId: string;
  content: string;
  isStreaming: boolean;
};

export type ConversationItem =
  | { kind: "message"; message: LocalMessage }
  | { kind: "tool"; tool: ToolCallState }
  | { kind: "reasoning"; reasoning: LocalReasoning };

function extractTaskContent(raw: string): string {
  // Strip "## Current Task" markdown header if present
  let content = raw.replace(/^## Current Task\s*\n/, "").trim();

  // Strip <task>...</task> wrapper
  const taskMatch = content.match(/<task>\n([\s\S]*?)\n<\/task>/);
  if (taskMatch?.[1]) {
    content = taskMatch[1].trim();
  }

  // Strip <system-reminder>...</system-reminder> wrapper
  const sysMatch = content.match(/<system-reminder[^>]*>\n?([\s\S]*?)\n?<\/system-reminder>/);
  if (sysMatch?.[1]) {
    content = sysMatch[1].trim();
  }

  // Strip <user-message>...</user-message> wrapper
  const userMatch = content.match(/<user-message[^>]*>\n?([\s\S]*?)\n?<\/user-message>/);
  if (userMatch?.[1]) {
    content = userMatch[1].trim();
  }

  // Strip image markers like [image: filename.png] — internal placeholders for backend
  content = content.replace(/\[image:[^\]]*\]\s*/g, "").trim();

  // Strip embedded markdown image data URIs — images rendered via MessageAttachments instead
  content = content.replace(/\n?!\[image\]\(data:[^)]+\)/g, "").trim();

  return content;
}

/** Extract inline image data URIs from content string into LocalImage objects.
 *  Parses `![filename](data:mimeType;base64,data)` markdown — alt text is the
 *  filename stored by the harness (passed via the `filename` field on file parts).
 *  Falls back to undefined when alt is the generic sentinel "image".
 */
function extractInlineImages(content: string): Array<{ data: string; mimeType: string; filename?: string }> {
  const images: Array<{ data: string; mimeType: string; filename?: string }> = [];
  const mdPattern = /!\[([^\]]*)\]\(data:([^;]+);base64,([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdPattern.exec(content)) !== null) {
    const alt = match[1]!.trim();
    const filename = alt && alt !== "image" ? alt : undefined;
    images.push({ mimeType: match[2]!, data: match[3]!, filename });
  }
  return images;
}

const INLINE_THINK_RE = /<think>[\s\S]*?<\/think>\s*/g;

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content.replace(INLINE_THINK_RE, "").trim();
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } => part?.type === "text")
      .map((part) => part.text.replace(INLINE_THINK_RE, "").trim())
      .join("\n")
      .trim();
  }
  return "";
}

function extractReasoningContent(content: unknown): string {
  // Native thinking blocks (Claude extended thinking, etc.)
  if (Array.isArray(content)) {
    const native = content
      .filter((part): part is { type: "thinking"; thinking: string } =>
        part?.type === "thinking" && typeof part.thinking === "string",
      )
      .map((part) => part.thinking)
      .join("\n")
      .trim();
    if (native) return native;

    // Fallback: inline <think>...</think> in text blocks (DeepSeek, Qwen, etc.)
    for (let i = content.length - 1; i >= 0; i--) {
      if (content[i]?.type === "text" && typeof content[i].text === "string") {
        const matches = [...content[i].text.matchAll(/<think>([\s\S]*?)<\/think>/g)];
        if (matches.length) return matches.map((m) => m[1]).join("\n").trim();
      }
    }
  }
  if (typeof content === "string") {
    const matches = [...content.matchAll(/<think>([\s\S]*?)<\/think>/g)];
    if (matches.length) return matches.map((m) => m[1]).join("\n").trim();
  }
  return "";
}

function extractMessageImages(
  content: unknown,
): Array<{ data: string; mimeType: string; filename?: string }> {
  if (typeof content === "string") {
    return extractInlineImages(content);
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((part) => {
    if (part?.type !== "file" || typeof part.data !== "string") {
      return [];
    }

    const mimeType =
      typeof part.mimeType === "string"
        ? part.mimeType
        : typeof part.mediaType === "string"
          ? part.mediaType
          : undefined;

    if (!mimeType?.startsWith("image/")) {
      return [];
    }

    return [{
      data: part.data,
      mimeType,
      ...(typeof part.filename === "string" && part.filename ? { filename: part.filename } : {}),
    }];
  });
}

function compactToolState(tool: ToolCallState): ToolCallState {
  return {
    toolCallId: tool.toolCallId,
    name: tool.name,
    args: tool.args,
    ...(tool.preview !== undefined ? { preview: tool.preview } : {}),
    ...(tool.result !== undefined ? { result: tool.result } : {}),
    ...(tool.isError !== undefined ? { isError: tool.isError } : {}),
  };
}

function createToolState(message: SessionMessage): ToolCallState | null {
  if (!message.toolCallId || !message.name) {
    return null;
  }

  if (message.role === "tool_call") {
    return compactToolState({
      toolCallId: message.toolCallId,
      name: message.name,
      args: extractTextContent(message.content),
    });
  }

  if (message.role === "tool") {
    return compactToolState({
      toolCallId: message.toolCallId,
      name: message.name,
      args: "",
      result: extractTextContent(message.content),
    });
  }

  return null;
}

export function normalizeThreadMessages(messages: SessionMessage[]): ConversationItem[] {
  const normalized: ConversationItem[] = [];
  const toolById = new Map<string, ToolCallState>();
  const toolItemIndexById = new Map<string, number>();

  for (const [index, message] of messages.entries()) {
    if (message.role === "tool_call" || message.role === "tool") {
      const nextTool = createToolState(message);
      if (!nextTool) continue;

      const previousTool = toolById.get(nextTool.toolCallId);
      const mergedTool = compactToolState({
        ...previousTool,
        ...nextTool,
        toolCallId: nextTool.toolCallId,
        name: nextTool.name,
        args: nextTool.args || previousTool?.args || "",
        preview: nextTool.preview ?? previousTool?.preview,
        result: nextTool.result ?? previousTool?.result,
        isError: nextTool.isError ?? previousTool?.isError,
      });

      toolById.set(nextTool.toolCallId, mergedTool);

      const existingIndex = toolItemIndexById.get(mergedTool.toolCallId);
      if (existingIndex !== undefined) {
        normalized[existingIndex] = { kind: "tool", tool: mergedTool };
      } else {
        toolItemIndexById.set(mergedTool.toolCallId, normalized.length);
        normalized.push({ kind: "tool", tool: mergedTool });
      }
      continue;
    }

    if (message.role !== "user" && message.role !== "assistant") continue;

    const textContent = extractTextContent(message.content);
    const content = message.role === "user" ? extractTaskContent(textContent) : textContent;

    if (message.role === "assistant") {
      const reasoningContent = extractReasoningContent(message.content);
      if (reasoningContent) {
        normalized.push({
          kind: "reasoning",
          reasoning: {
            localId: `${message.id ?? `thread-${index}`}-reasoning`,
            content: reasoningContent,
            isStreaming: false,
          },
        });
      }
      if (content) {
        normalized.push({
          kind: "message",
          message: {
            localId: message.id ?? `thread-${index}`,
            role: "assistant",
            content,
          },
        });
      }
      if (reasoningContent || content) {
        continue;
      }
      continue;
    }

    const images = extractMessageImages(message.content);

    if (!content && images.length === 0) continue;

    normalized.push({
      kind: "message",
      message: {
        localId: message.id ?? `thread-${index}`,
        role: "user",
        content,
        ...(images.length > 0 ? { images } : {}),
      },
    });
  }

  return normalized;
}

export function useAgentSession(onError: (message: string | null) => void) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    createInitialSessionSnapshot(),
  );
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const streamingRef = useRef("");
  // Accumulate tool calls for the current running turn
  const pendingToolsRef = useRef<ToolCallState[]>([]);
  // Mutable mirror of items for fast mutation during streaming
  const itemsRef = useRef<ConversationItem[]>([]);
  // Index in items where the current streaming turn began (-1 when idle)
  const streamingStartRef = useRef<number>(-1);

  useEffect(() => {
    const off = window.codemap.onAgentEvent((event) => {
      setSnapshot((current) => reduceAgentSessionEvent(current, event));
      handleEvent(event);
    });
    return off;
  }, []);

  function handleEvent(event: AgentSessionEvent) {
    if (event.type === "thinking") {
      const items = itemsRef.current;
      if (items.length > 0 && items[items.length - 1]!.kind === "reasoning") {
        const last = items[items.length - 1]! as Extract<ConversationItem, { kind: "reasoning" }>;
        items[items.length - 1] = {
          kind: "reasoning",
          reasoning: {
            ...last.reasoning,
            content: last.reasoning.content + event.text,
            isStreaming: true,
          },
        };
      } else {
        items.push({
          kind: "reasoning",
          reasoning: {
            localId: crypto.randomUUID(),
            content: event.text,
            isStreaming: true,
          },
        });
      }
      setItems([...items]);
      return;
    }
    if (event.type === "token") {
      streamingRef.current += event.text;
      let items = itemsRef.current;

      // If there's an empty reasoning placeholder (model isn't reasoning),
      // remove it before adding text — the placeholder was injected on
      // status:"running" and never got filled by a thinking event.
      if (items.some((item) => item.kind === "reasoning" && item.reasoning && !item.reasoning.content)) {
        items = items.filter((item) => !(item.kind === "reasoning" && item.reasoning && !item.reasoning.content));
        itemsRef.current = items;
      }

      if (items.length > 0) {
        const lastItem = items[items.length - 1]!;
        if (lastItem.kind === "message" && lastItem.message.role === "assistant") {
          items[items.length - 1] = {
            kind: "message",
            message: {
              ...lastItem.message,
              content: (lastItem.message.content ?? "") + event.text,
            },
          };
        } else {
          items.push({
            kind: "message",
            message: { localId: crypto.randomUUID(), role: "assistant", content: event.text },
          });
        }
      } else {
        items.push({
          kind: "message",
          message: { localId: crypto.randomUUID(), role: "assistant", content: event.text },
        });
      }
      setItems([...items]);
      return;
    }
    if (event.type === "tool_start") {
      const tool: ToolCallState = {
        toolCallId: event.toolCallId,
        name: event.name,
        args: event.args,
        preview: event.preview,
      };
      pendingToolsRef.current = [
        ...pendingToolsRef.current,
        tool,
      ];
      // Push tool to items (chronological order, after any prior text/tools)
      const items = itemsRef.current;
      items.push({ kind: "tool", tool });
      setItems([...items]);
      return;
    }
    if (event.type === "tool_result") {
      pendingToolsRef.current = pendingToolsRef.current.map((t) =>
        t.toolCallId === event.toolCallId
          ? { ...t, result: event.result, isError: event.isError }
          : t,
      );
      // Update tool in items in-place (result fills into the existing tool entry)
      const items = itemsRef.current;
      const idx = items.findIndex(
        (item) => item.kind === "tool" && item.tool.toolCallId === event.toolCallId,
      );
      if (idx >= 0) {
        const existing = items[idx]! as Extract<ConversationItem, { kind: "tool" }>;
        items[idx] = {
          kind: "tool",
          tool: {
            ...existing.tool,
            result: event.result,
            isError: event.isError,
          },
        };
        setItems([...items]);
      }
      return;
    }
    if (event.type === "plan_review_resolved") {
      const result = "Plan reviewed";
      pendingToolsRef.current = pendingToolsRef.current.map((t) =>
        t.toolCallId === event.planReviewId || t.name === "submit_plan"
          ? { ...t, result, isError: false }
          : t,
      );
      const items = itemsRef.current;
      // Mark ALL pending submit_plan tools as resolved, not just the first one
      let modified = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (
          item.kind === "tool" &&
          (item.tool.toolCallId === event.planReviewId || item.tool.name === "submit_plan") &&
          item.tool.result === undefined
        ) {
          items[i] = {
            kind: "tool",
            tool: {
              ...item.tool,
              result,
              isError: false,
            },
          };
          modified = true;
        }
      }
      if (modified) {
        setItems([...items]);
      }
      return;
    }
    if (event.type === "thread_change") {
      streamingRef.current = "";
      pendingToolsRef.current = [];
      streamingStartRef.current = -1;
      const newItems = normalizeThreadMessages(event.messages);
      itemsRef.current = newItems;
      setItems(newItems);
      setLoadingMessages(false);
      return;
    }
    if (event.type === "status" && event.status === "running") {
      // Inject a placeholder reasoning item so the user sees "Thinking..."
      // immediately, even before the model streams its first thinking block.
      // Mark the streaming start index if this is the first item of a new turn
      if (streamingStartRef.current === -1) {
        streamingStartRef.current = itemsRef.current.length;
      }
      itemsRef.current.push({
        kind: "reasoning",
        reasoning: {
          localId: crypto.randomUUID(),
          content: "",
          isStreaming: true,
        },
      });
      setItems([...itemsRef.current]);
      return;
    }
    if (event.type === "status" && event.status === "idle") {
      const items = itemsRef.current;
      streamingRef.current = "";
      pendingToolsRef.current = [];
      streamingStartRef.current = -1;

      // Mark all reasoning items as non-streaming
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "reasoning") {
          items[i] = {
            kind: "reasoning",
            reasoning: {
              ...item.reasoning,
              isStreaming: false,
            },
          };
        }
      }
      setItems([...items]);

      setSnapshot((current) => ({ ...current, streamingText: "" }));
    }
    if (event.type === "error") onError(event.message);
  }

  const displayItems = useMemo(() => items, [items]);

  const switchThread = useCallback(
    async (threadId: string) => {
      // Don't clear items — keep the current conversation visible during
      // the switch. thread_change event replaces them on success; on failure
      // they stay untouched (no scroll jump to restore).
      setLoadingMessages(true);
      streamingRef.current = "";
      pendingToolsRef.current = [];
      streamingStartRef.current = -1;
      try {
        await window.codemap.switchThread(threadId);
        // Clear any previous error when switch succeeds
        onError(null);
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim().length > 0
            ? err.message
            : "Failed to switch thread";
        onError(message);
      } finally {
        setLoadingMessages(false);
      }
    },
    [onError],
  );

  function resetSession() {
    streamingRef.current = "";
    pendingToolsRef.current = [];
    streamingStartRef.current = -1;
    itemsRef.current = [];
    setItems([]);
    setSnapshot(createInitialSessionSnapshot());
  }

  function appendUserMessage(content: string, images?: Array<{ data: string; mimeType: string; filename?: string }>) {
    setItems((current) => [
      ...current,
      {
        kind: "message",
        message: {
          localId: crypto.randomUUID(),
          role: "user",
          content: extractTaskContent(content),
          ...(images && images.length > 0 ? { images } : {}),
        },
      },
    ]);
  }

  function resetSnapshotForSubmit() {
    streamingRef.current = "";
    pendingToolsRef.current = [];
    streamingStartRef.current = -1;
    // Note: items are preserved — aborted turns stay visible in the conversation,
    // and only streaming state is reset for the next submission.
    setSnapshot((current) => ({
      ...current,
      streamingText: "",
      thinkingText: "",
      error: null,
    }));
  }

  function appendSystemMessage(content: string) {
    setItems((current) => [
      ...current,
      {
        kind: "message",
        message: {
          localId: crypto.randomUUID(),
          role: "assistant",
          content,
        },
      },
    ]);
  }

  return {
    snapshot,
    items,
    displayItems,
    loadingMessages,
    switchThread,
    resetSession,
    appendUserMessage,
    appendSystemMessage,
    resetSnapshotForSubmit,
  };
}
