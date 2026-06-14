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
      setMessages(
        event.messages.map((message, index) => ({
          ...message,
          localId: message.id ?? `thread-${index}`,
        })) as LocalMessage[],
      );
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
      { localId: crypto.randomUUID(), role: "user", content },
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
