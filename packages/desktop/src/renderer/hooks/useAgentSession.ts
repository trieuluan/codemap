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
  /** Tool calls that ran during this assistant turn */
  tools?: ToolCallState[];
};

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

export function normalizeThreadMessages(messages: SessionMessage[]): LocalMessage[] {
  const normalized: LocalMessage[] = [];
  const toolById = new Map<string, ToolCallState>();
  let lastAssistantMessage: LocalMessage | null = null;

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

      if (lastAssistantMessage) {
        const currentTools = lastAssistantMessage.tools ?? [];
        const nextTools = currentTools.some((tool) => tool.toolCallId === mergedTool.toolCallId)
          ? currentTools.map((tool) =>
              tool.toolCallId === mergedTool.toolCallId ? mergedTool : tool,
            )
          : [...currentTools, mergedTool];
        lastAssistantMessage.tools = nextTools;
      }
      continue;
    }

    if (message.role !== "user" && message.role !== "assistant") continue;

    const textContent = extractTextContent(message.content);
    const content = message.role === "user" ? extractTaskContent(textContent) : textContent;

    if (message.role === "assistant") {
      const assistantMessage: LocalMessage = {
        localId: message.id ?? `thread-${index}`,
        role: "assistant",
        content,
      };
      normalized.push(assistantMessage);
      lastAssistantMessage = assistantMessage;
      continue;
    }

    if (!content && textContent === "") continue;

    // For user messages: extract any embedded image data URIs from the raw text
    // (harness may store images as ![image](data:...) in the content string)
    const inlineImages = extractInlineImages(textContent);

    if (!content && inlineImages.length === 0) continue;

    normalized.push({
      localId: message.id ?? `thread-${index}`,
      role: "user",
      content,
      ...(inlineImages.length > 0 ? { images: inlineImages } : {}),
    });
    lastAssistantMessage = null;
  }

  return normalized.filter(
    (message) => message.role === "user" || message.content || (message.tools?.length ?? 0) > 0,
  );
}

function finalizeAssistantTurn(content: string, tools: ToolCallState[]): LocalMessage | null {
  if (!content && tools.length === 0) {
    return null;
  }

  return {
    localId: crypto.randomUUID(),
    role: "assistant",
    content,
    tools: tools.length > 0 ? tools : undefined,
  };
}

export function useAgentSession(onError: (message: string | null) => void) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    createInitialSessionSnapshot(),
  );
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const streamingRef = useRef("");
  // Accumulate tool calls for the current running turn
  const pendingToolsRef = useRef<ToolCallState[]>([]);

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
      return;
    }
    if (event.type === "tool_start") {
      pendingToolsRef.current = [
        ...pendingToolsRef.current,
        {
          toolCallId: event.toolCallId,
          name: event.name,
          args: event.args,
          preview: event.preview,
        },
      ];
      return;
    }
    if (event.type === "tool_result") {
      pendingToolsRef.current = pendingToolsRef.current.map((t) =>
        t.toolCallId === event.toolCallId
          ? { ...t, result: event.result, isError: event.isError }
          : t,
      );
      return;
    }
    if (event.type === "thread_change") {
      streamingRef.current = "";
      pendingToolsRef.current = [];
      setLoadingMessages(false);
      setMessages(normalizeThreadMessages(event.messages));
      return;
    }
    if (event.type === "status" && event.status === "idle") {
      const content = streamingRef.current;
      const tools = pendingToolsRef.current;
      streamingRef.current = "";
      pendingToolsRef.current = [];

      const assistantMessage = finalizeAssistantTurn(content, tools);
      if (assistantMessage) {
        setMessages((current) => [...current, assistantMessage]);
      }

      setSnapshot((current) => ({ ...current, streamingText: "", tools: [] }));
    }
    if (event.type === "error") onError(event.message);
  }

  const displayMessages = useMemo(
    () => [
      ...messages,
      ...(snapshot.streamingText
        ? [
            {
              localId: "streaming",
              role: "assistant" as const,
              content: snapshot.streamingText,
            },
          ]
        : []),
    ],
    [messages, snapshot.streamingText],
  );

  const switchThread = useCallback(
    async (threadId: string) => {
      // Don't clear messages — keep the current conversation visible during
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
    setMessages([]);
    setSnapshot(createInitialSessionSnapshot());
  }

  function appendUserMessage(content: string, images?: Array<{ data: string; mimeType: string; filename?: string }>) {
    setMessages((current) => [
      ...current,
      {
        localId: crypto.randomUUID(),
        role: "user",
        content: extractTaskContent(content),
        ...(images && images.length > 0 ? { images } : {}),
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
    messages,
    displayMessages,
    loadingMessages,
    switchThread,
    resetSession,
    appendUserMessage,
    resetSnapshotForSubmit,
  };
}
