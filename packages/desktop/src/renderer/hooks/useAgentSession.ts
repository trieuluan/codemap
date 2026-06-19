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

export type ConversationItem =
  | { kind: "message"; message: LocalMessage }
  | { kind: "tool"; tool: ToolCallState };

type LiveFeedItem =
  | { kind: "tool"; tool: ToolCallState }
  | { kind: "text"; id: string; content: string };

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

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } => part?.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
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
      if (!content) continue;
      normalized.push({
        kind: "message",
        message: {
          localId: message.id ?? `thread-${index}`,
          role: "assistant",
          content,
        },
      });
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

function liveFeedToConversationItems(feed: LiveFeedItem[]): ConversationItem[] {
  return feed.flatMap((item): ConversationItem[] => {
    if (item.kind === "tool") {
      return [{ kind: "tool", tool: item.tool }];
    }
    if (!item.content) return [];
    return [{
      kind: "message",
      message: {
        localId: item.id,
        role: "assistant",
        content: item.content,
      },
    }];
  });
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
  // Unified chronological feed: interleaves tools and text by event order
  const liveFeedRef = useRef<LiveFeedItem[]>([]);
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);

  useEffect(() => {
    const off = window.codemap.onAgentEvent((event) => {
      setSnapshot((current) => reduceAgentSessionEvent(current, event));
      handleEvent(event);
    });
    return off;
  }, []);

  function handleEvent(event: AgentSessionEvent) {
    if (event.type === "token") {
      streamingRef.current += event.text;
      // Maintain unified chronological live feed
      const feed = liveFeedRef.current;
      if (feed.length > 0 && feed[feed.length - 1]!.kind === "text") {
        const last = feed[feed.length - 1]! as Extract<LiveFeedItem, { kind: "text" }>;
        feed[feed.length - 1] = {
          ...last,
          content: last.content + event.text,
        };
      } else {
        feed.push({ kind: "text", id: crypto.randomUUID(), content: event.text });
      }
      setLiveFeed([...feed]);
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
      // Push tool to live feed (chronological order, after any prior text/tools)
      const feed = liveFeedRef.current;
      feed.push({ kind: "tool", tool });
      setLiveFeed([...feed]);
      return;
    }
    if (event.type === "tool_result") {
      pendingToolsRef.current = pendingToolsRef.current.map((t) =>
        t.toolCallId === event.toolCallId
          ? { ...t, result: event.result, isError: event.isError }
          : t,
      );
      // Update tool in live feed in-place (result fills into the existing tool entry)
      const feed = liveFeedRef.current;
      const idx = feed.findIndex(
        (item) => item.kind === "tool" && item.tool.toolCallId === event.toolCallId,
      );
      if (idx >= 0) {
        const existing = feed[idx]! as Extract<LiveFeedItem, { kind: "tool" }>;
        feed[idx] = {
          kind: "tool",
          tool: {
            ...existing.tool,
            result: event.result,
            isError: event.isError,
          },
        };
        setLiveFeed([...feed]);
      }
      return;
    }
    if (event.type === "thread_change") {
      streamingRef.current = "";
      pendingToolsRef.current = [];
      liveFeedRef.current = [];
      setLiveFeed([]);
      setLoadingMessages(false);
      setItems(normalizeThreadMessages(event.messages));
      return;
    }
    if (event.type === "status" && event.status === "idle") {
      const feed = liveFeedRef.current;
      streamingRef.current = "";
      pendingToolsRef.current = [];
      liveFeedRef.current = [];
      setLiveFeed([]);

      const finishedItems = liveFeedToConversationItems(feed);
      if (finishedItems.length > 0) {
        setItems((current) => [...current, ...finishedItems]);
      }

      setSnapshot((current) => ({ ...current, streamingText: "", tools: [] }));
    }
    if (event.type === "error") onError(event.message);
  }

  const displayItems = useMemo(
    () => [
      ...items,
      ...liveFeedToConversationItems(liveFeed),
    ],
    [items, liveFeed],
  );

  const switchThread = useCallback(
    async (threadId: string) => {
      // Don't clear items — keep the current conversation visible during
      // the switch. thread_change event replaces them on success; on failure
      // they stay untouched (no scroll jump to restore).
      setLoadingMessages(true);
      streamingRef.current = "";
      pendingToolsRef.current = [];
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
    setSnapshot((current) => ({
      ...current,
      streamingText: "",
      thinkingText: "",
      tools: [],
      error: null,
    }));
  }

  return {
    snapshot,
    items,
    displayItems,
    loadingMessages,
    switchThread,
    resetSession,
    appendUserMessage,
    resetSnapshotForSubmit,
  };
}
