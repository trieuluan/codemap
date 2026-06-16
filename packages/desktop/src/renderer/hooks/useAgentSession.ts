import { useEffect, useMemo, useRef, useState } from "react";
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

  return content;
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

    if (!content) continue;

    normalized.push({
      localId: message.id ?? `thread-${index}`,
      role: "user",
      content,
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

export function useAgentSession(onError: (message: string) => void) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    createInitialSessionSnapshot(),
  );
  const [messages, setMessages] = useState<LocalMessage[]>([]);
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

  function resetSession() {
    streamingRef.current = "";
    setMessages([]);
    setSnapshot(createInitialSessionSnapshot());
  }

  function appendUserMessage(content: string) {
    setMessages((current) => [
      ...current,
      {
        localId: crypto.randomUUID(),
        role: "user",
        content: extractTaskContent(content),
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
    resetSession,
    appendUserMessage,
    resetSnapshotForSubmit,
  };
}
