import { useState, useCallback, useEffect, useRef } from "react";
import { render, Box, Text, useApp, useStdin } from "ink";
import { Spinner } from "@inkjs/ui";
import type { NineRouterProvider } from "../provider.js";
import type { ChatMessage, ChatToolCall } from "../types.js";
import { runAgentLoop } from "./agent-loop.js";
import type { CodeMapMcpToolClient } from "./mcp-tool-client.js";

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
}

function InkChatApp({ provider, model, toolClient, profileId, mode }: InkChatAppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const inputRef = useRef(input);
  inputRef.current = input;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const { stdin, setRawMode } = useStdin();

  useEffect(() => {
    setMessages([
      {
        role: "system",
        content: `CodeMap chat (${profileId} -> ${model}, ${mode})\nType your message and press Enter. Ctrl+C to exit.`,
      },
    ]);
  }, []);

  // Keypress handling
  useEffect(() => {
    if (!stdin || !setRawMode) return;
    setRawMode(true);

    const onData = (data: Buffer) => {
      const str = data.toString();

      // Ctrl+C
      if (str === "\x03") {
        exit();
        return;
      }

      // Enter
      if (str === "\r" || str === "\n") {
        const trimmed = inputRef.current.trim();
        if (trimmed && !busyRef.current) {
          handleUserSubmit(trimmed);
        }
        return;
      }

      // Backspace
      if (str === "\x7f" || str === "\b") {
        setInput((prev) => prev.slice(0, -1));
        return;
      }

      // Skip control sequences (arrow keys, etc.)
      if (str.startsWith("\x1b")) return;

      // Printable character
      if (str.length === 1 && str.charCodeAt(0) >= 32) {
        setInput((prev) => prev + str);
      }
    };

    stdin.on("data", onData);
    return () => {
      stdin.off("data", onData);
    };
  }, [stdin, setRawMode, exit]);

  const handleUserSubmit = useCallback(
    async (text: string) => {
      // Handle slash commands
      if (text.startsWith("/")) {
        const [cmd] = text.split(/\s+/);

        if (cmd === "/exit") {
          exit();
          return;
        }

        if (cmd === "/clear") {
          setMessages([]);
          setHistory([]);
          setInput("");
          return;
        }

        if (cmd === "/tools") {
          setBusy(true);
          try {
            const tools = await toolClient.listAllowedTools();
            const toolList = tools.map((t) => `- ${t.name}${t.description ? ` — ${t.description}` : ""}`).join("\n");
            setMessages((prev) => [...prev, { role: "system", content: `Available tools:\n${toolList}` }]);
          } catch (err) {
            setMessages((prev) => [...prev, { role: "system", content: `Error listing tools: ${err}` }]);
          }
          setBusy(false);
          setInput("");
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
          setInput("");
          return;
        }

        setMessages((prev) => [...prev, { role: "system", content: `Unknown command: ${cmd}. Try /tools, /diff, /clear, /exit` }]);
        setInput("");
        return;
      }

      // Normal message — run agent loop
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setInput("");
      setBusy(true);

      try {
        const userMessage: ChatMessage = { role: "user", content: text };

        const result = await runAgentLoop({
          provider,
          model,
          history,
          userMessage,
          toolClient,
        });

        // Show tool calls from the conversation
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
              content: msg.content.slice(0, 500) + (msg.content.length > 500 ? "\n..." : ""),
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

      {/* Busy indicator */}
      {busy && (
        <Box marginBottom={1}>
          <Spinner label="Thinking..." />
        </Box>
      )}

      {/* Input line */}
      <Box>
        <Text color="cyan" bold>
          codemap{"> "}
        </Text>
        <Text>{input}</Text>
      </Box>
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
      <Text color={colorMap[entry.role]} bold>
        {labelMap[entry.role]}:
      </Text>
      <Box paddingLeft={2}>
        <Text wrap="wrap">{entry.content}</Text>
      </Box>
    </Box>
  );
}

// Export the render function
export function startInkChat(options: {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  profileId: string;
  mode: string;
}) {
  const { waitUntilExit } = render(
    <InkChatApp
      provider={options.provider}
      model={options.model}
      toolClient={options.toolClient}
      profileId={options.profileId}
      mode={options.mode}
    />
  );

  return waitUntilExit();
}
