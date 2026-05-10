import { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useApp } from "ink";
import { Spinner } from "@inkjs/ui";
import type { NineRouterProvider } from "../provider.js";
import type { ChatMessage, ChatToolCall } from "../types.js";
import { runAgentLoop } from "./agent-loop.js";
import { hydrateMentionContext } from "./mention-context.js";
import type { CodeMapMcpToolClient } from "./mcp-tool-client.js";
import { MentionInput } from "./mention-input.js";

interface ChatEntry {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
  toolCalls?: ChatToolCall[];
}

interface InkChatAppProps {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  profileId: string;
  mode: string;
  availableModels?: string[];
}

function InkChatApp({ provider, model, toolClient, profileId, mode, availableModels }: InkChatAppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const lines = [
      `CodeMap chat (${profileId} -> ${model}, ${mode})`,
    ];
    if (availableModels && availableModels.length > 0) {
      lines.push(`Gateway models: ${availableModels.length} available`);
    }
    lines.push("Type your message and press Enter. @ to mention files. /help for commands.");
    setMessages([{ role: "system", content: lines.join("\n") }]);
  }, []);

  const handleUserSubmit = useCallback(
    async (text: string) => {
      if (busyRef.current) return;

      if (text.startsWith("/")) {
        const [cmd] = text.split(/\s+/);

        if (cmd === "/exit") {
          exit();
          return;
        }

        if (cmd === "/clear") {
          setMessages([]);
          setHistory([]);
          return;
        }

        if (cmd === "/help") {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: [
                "/help    — Show this help",
                "/models  — List available gateway models",
                "/tools   — List available MCP tools",
                "/diff    — Show working diff",
                "/clear   — Clear chat history",
                "/exit    — Exit chat",
                "",
                "@mention — Type @ to autocomplete file paths",
              ].join("\n"),
            },
          ]);
          return;
        }

        if (cmd === "/models") {
          if (availableModels && availableModels.length > 0) {
            const list = availableModels.map((m) => `- ${m}`).join("\n");
            setMessages((prev) => [...prev, { role: "system", content: `Gateway models (${availableModels.length}):\n${list}` }]);
          } else {
            setMessages((prev) => [...prev, { role: "system", content: "No gateway models available. Using configured profile models." }]);
          }
          return;
        }

        if (cmd === "/tools") {
          setBusy(true);
          try {
            const tools = await toolClient.listAllowedTools();
            const toolList = tools
              .map((t) => `- ${t.name}${t.description ? ` — ${t.description}` : ""}`)
              .join("\n");
            setMessages((prev) => [...prev, { role: "system", content: `Available tools:\n${toolList}` }]);
          } catch (err) {
            setMessages((prev) => [...prev, { role: "system", content: `Error listing tools: ${err}` }]);
          }
          setBusy(false);
          return;
        }

        if (cmd === "/diff") {
          setBusy(true);
          try {
            const result = await toolClient.callTool("get_working_diff", {
              include_patch: false,
              include_untracked: true,
            });
            setMessages((prev) => [...prev, { role: "system", content: result.content }]);
          } catch (err) {
            setMessages((prev) => [...prev, { role: "system", content: `Error: ${err}` }]);
          }
          setBusy(false);
          return;
        }

        setMessages((prev) => [...prev, { role: "system", content: `Unknown command: ${cmd}. Try /models, /tools, /diff, /clear, /exit` }]);
        return;
      }

      // Normal message — hydrate @mentions then run agent loop
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setBusy(true);

      try {
        const mentionContext = await hydrateMentionContext(text);
        for (const warning of mentionContext.warnings) {
          setMessages((prev) => [...prev, { role: "system", content: `⚠ ${warning}` }]);
        }

        const userMessage: ChatMessage = { role: "user", content: mentionContext.content };
        setStreamingText("");

        const result = await runAgentLoop({
          provider,
          model,
          history,
          userMessage,
          toolClient,
          onToken: (token) => {
            setStreamingText((prev) => prev + token);
          },
        });

        setStreamingText("");

        const toolEntries: ChatEntry[] = [];
        for (const msg of result.messages) {
          if (msg.role === "assistant" && msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              toolEntries.push({
                role: "tool",
                content: `Called: ${tc.function.name}(${tc.function.arguments})`,
                toolName: tc.function.name,
              });
            }
          }
          if (msg.role === "tool") {
            toolEntries.push({
              role: "tool",
              content: msg.content.length > 500 ? msg.content.slice(0, 500) + "\n..." : msg.content,
              toolName: msg.name,
            });
          }
        }

        setMessages((prev) => [
          ...prev,
          ...toolEntries,
          { role: "assistant", content: result.text || "(no response)" },
        ]);

        setHistory((prev) => [...prev, ...result.messages]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages((prev) => [...prev, { role: "system", content: `Error: ${errMsg}` }]);
      }

      setBusy(false);
    },
    [provider, model, history, toolClient, exit]
  );

  return (
    <Box flexDirection="column" padding={1}>
      {/* Chat messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <ChatBubble key={i} entry={msg} />
        ))}
      </Box>

      {/* Streaming response or busy indicator */}
      {streamingText ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="white" bold>Agent:</Text>
          <Box paddingLeft={2}>
            <Text wrap="wrap">{streamingText}</Text>
          </Box>
        </Box>
      ) : busy ? (
        <Box marginBottom={1}>
          <Spinner label="Thinking..." />
        </Box>
      ) : null}

      {/* Input with inline @mention autocomplete */}
      {!busy && (
        <MentionInput onSubmit={handleUserSubmit} busy={busy} />
      )}
    </Box>
  );
}

function ChatBubble({ entry }: { entry: ChatEntry }) {
  const colorMap: Record<string, string> = {
    user: "green",
    assistant: "white",
    tool: "yellow",
    system: "gray",
  };
  const labelMap: Record<string, string> = {
    user: "You",
    assistant: "Agent",
    tool: entry.toolName ? `🔧 ${entry.toolName}` : "Tool",
    system: "⚙",
  };

  return (
    <Box flexDirection="column" marginBottom={0}>
      <Text color={colorMap[entry.role] as "green" | "white" | "yellow" | "gray"} bold>
        {labelMap[entry.role]}:
      </Text>
      <Box paddingLeft={2}>
        <Text wrap="wrap">{entry.content}</Text>
      </Box>
    </Box>
  );
}

export function startInkChat(options: {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  profileId: string;
  mode: string;
  availableModels?: string[];
}) {
  const { waitUntilExit } = render(
    <InkChatApp
      provider={options.provider}
      model={options.model}
      toolClient={options.toolClient}
      profileId={options.profileId}
      mode={options.mode}
      availableModels={options.availableModels}
    />
  );

  return waitUntilExit();
}
