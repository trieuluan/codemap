import { useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialSessionSnapshot,
  reduceAgentSessionEvent,
} from "@codemap-ai/core/agent/session";
import type {
  AgentSessionEvent,
  SessionSnapshot,
} from "@codemap-ai/core/agent/contracts";

export type LocalMessage = {
  localId: string;
  role: "user" | "assistant";
  content: string;
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

export function useAgentSession(onError: (message: string) => void) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    createInitialSessionSnapshot(),
  );
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const streamingRef = useRef("");

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
    if (event.type === "thread_change") {
      streamingRef.current = "";
      const normalized: LocalMessage[] = [];
      event.messages.forEach((message, index) => {
        if (message.role !== "user" && message.role !== "assistant") return;
        const textContent = extractTextContent(message.content);
        if (!textContent) return;
        // For user messages, strip XML wrappers (Current Task, system-reminder, user-message, task)
        const content = message.role === "user" ? extractTaskContent(textContent) : textContent;
        normalized.push({
          localId: message.id ?? `thread-${index}`,
          role: message.role,
          content,
        });
      });
      setMessages(normalized);
      return;
    }
    if (
      event.type === "status" &&
      event.status === "idle" &&
      streamingRef.current
    ) {
      const content = streamingRef.current;
      streamingRef.current = "";
      setMessages((current) => [
        ...current,
        { localId: crypto.randomUUID(), role: "assistant", content },
      ]);
      setSnapshot((current) => ({ ...current, streamingText: "" }));
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
