import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { render, Box, Text, useApp } from "ink";
import {
  Spinner,
  Alert,
  Badge,
  StatusMessage,
} from "@inkjs/ui";
import cfonts from "cfonts";
import type { NineRouterProvider } from "../provider.js";
import type { ChatMessage, ChatToolCall, GatewayMode } from "../types.js";
import { runAgentLoop } from "./agent-loop.js";
import { hydrateMentionContext } from "./mention-context.js";
import type { CodeMapMcpToolClient } from "./mcp-tool-client.js";
import { MentionInput } from "./mention-input.js";
import { getModeDisplay } from "./route-policy.js";
import { executeCommand } from "./commands/index.js";

interface WelcomeData {
  model: string;
  mode: GatewayMode;
  profile: string;
  modelCount?: number;
}

export interface ChatEntry {
  role: "user" | "assistant" | "tool" | "system" | "welcome";
  content: string;
  toolName?: string;
  toolCalls?: ChatToolCall[];
  welcomeData?: WelcomeData;
  systemComponent?: React.ReactNode;
}

interface InkChatAppProps {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  profileId: string;
  mode: GatewayMode;
  availableModels?: string[];
}

function InkChatApp({
  provider,
  model: initialModel,
  toolClient,
  profileId,
  mode: initialMode,
  availableModels,
}: InkChatAppProps) {
  const { exit } = useApp();
  const [currentModel, setCurrentModel] = useState(initialModel);
  const [currentMode, setCurrentMode] = useState(initialMode);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const welcome: ChatEntry = {
      role: "welcome",
      content: "",
      welcomeData: {
        model: initialModel,
        mode: initialMode,
        profile: profileId,
        modelCount: availableModels?.length,
      },
    };
    setMessages([welcome]);
  }, []);

  const handleUserSubmit = useCallback(
    async (text: string) => {
      if (busyRef.current) return;

      if (text.startsWith("/")) {
        const handled = await executeCommand(text, {
          currentModel,
          currentMode,
          profileId,
          history,
          availableModels,
          toolClient,
          setMessages,
          setHistory,
          setInputHistory,
          setCurrentModel,
          setCurrentMode,
          setBusy,
          exit,
        });
        if (!handled) {
          setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `Unknown command. Type /help for available commands.`,
            },
          ]);
        }
        return;
      }

      // Normal message — hydrate @mentions then run agent loop
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setInputHistory((prev) => [...prev, text]);
      setBusy(true);

      try {
        const mentionContext = await hydrateMentionContext(text);
        for (const warning of mentionContext.warnings) {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `⚠ ${warning}` },
          ]);
        }

        const userMessage: ChatMessage = {
          role: "user",
          content: mentionContext.content,
        };
        setStreamingText("");

        const result = await runAgentLoop({
          provider,
          model: currentModel,
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
              content:
                msg.content.length > 500
                  ? msg.content.slice(0, 500) + "\n..."
                  : msg.content,
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
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Error: ${errMsg}` },
        ]);
      }

      setBusy(false);
    },
    [provider, currentModel, currentMode, history, toolClient, exit],
  );

  return (
    <Box flexDirection="column">
      {/* Chat messages */}
      <Box flexDirection="column">
        {messages.map((msg, i) => (
          <ChatBubble key={i} entry={msg} />
        ))}
      </Box>

      {/* Streaming response */}
      {streamingText ? (
        <Box flexDirection="column" marginTop={1}>
          <StatusMessage variant="info">streaming...</StatusMessage>
          <Box paddingLeft={2} marginTop={0}>
            <Text wrap="wrap">{streamingText}</Text>
          </Box>
        </Box>
      ) : busy ? (
        <Box marginTop={1} paddingLeft={1}>
          <Spinner label="Thinking..." />
        </Box>
      ) : null}

      {/* Input area */}
      <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <MentionInput
          onSubmit={handleUserSubmit}
          busy={busy}
          inputHistory={inputHistory}
        />
      </Box>

      {/* Status bar */}
      <Box justifyContent="space-between" paddingX={1} marginTop={0}>
        <Box gap={1}>
          <Badge color="cyan">{currentModel}</Badge>
          <Badge color={getModeDisplay(currentMode).color}>{getModeDisplay(currentMode).label}</Badge>
        </Box>
        <Box>
          <Text color="gray">{history.length} msgs | /help</Text>
        </Box>
      </Box>
    </Box>
  );
}

function WelcomeBanner({ data }: { data: WelcomeData }) {
  const modeInfo = getModeDisplay(data.mode);

  // Render CODEMAP with cfonts, strip ANSI (Ink handles colors)
  const bannerLines = useMemo(() => {
    const result = cfonts.render("CODEMAP", {
      font: "block",
      colors: ["white"],
      align: "center",
      letterSpacing: 1,
      lineHeight: 1,
      env: "node",
    });
    if (!result) return ["CODEMAP"];
    return result.array
      .filter((line: string) => line.trim())
      .map((line: string) => line.replace(/\x1b\[[0-9;]*m/g, "").trimEnd());
  }, []);

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="double"
      borderColor="cyan"
      paddingX={1}
    >
      {bannerLines.map((line: string, i: number) => (
        <Box key={i}>
          <Text color="cyan" bold>
            {line}
          </Text>
        </Box>
      ))}
      <Box justifyContent="center" marginTop={1}>
        <Text color="gray" dimColor>
          {"Chat Agent"}
        </Text>
      </Box>
      <Box justifyContent="center" marginTop={1} gap={1}>
        <Badge color="cyan">{data.model}</Badge>
        <Badge color={modeInfo.color}>{modeInfo.label}</Badge>
        <Badge color="white">{data.profile}</Badge>
      </Box>
      {data.modelCount && (
        <Box justifyContent="center">
          <Text color="gray">Gateway: </Text>
          <Text color="green">{data.modelCount}</Text>
          <Text color="gray"> models available</Text>
        </Box>
      )}
      <Box justifyContent="center" marginTop={1}>
        <Text color="gray">Type </Text>
        <Text color="cyan">/help</Text>
        <Text color="gray"> for commands | </Text>
        <Text color="cyan">@</Text>
        <Text color="gray"> to mention files</Text>
      </Box>
    </Box>
  );
}

function ChatBubble({ entry }: { entry: ChatEntry }) {
  if (entry.role === "welcome" && entry.welcomeData) {
    return <WelcomeBanner data={entry.welcomeData} />;
  }

  if (entry.role === "tool") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={1}>
          <Badge color="yellow">{entry.toolName || "tool"}</Badge>
        </Box>
        <Box
          paddingLeft={2}
          borderStyle="single"
          borderColor="yellow"
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
        >
          <Text color="gray" dimColor>
            {truncate(entry.content, 300)}
          </Text>
        </Box>
      </Box>
    );
  }

  if (entry.role === "system") {
    if (entry.systemComponent) {
      return (
        <Box flexDirection="column" paddingX={1}>
          {entry.systemComponent}
        </Box>
      );
    }
    const lower = entry.content.toLowerCase();
    if (lower.startsWith("error") || lower.startsWith("blocked:")) {
      return (
        <Box paddingX={1}>
          <Alert variant="error">{entry.content}</Alert>
        </Box>
      );
    }
    if (lower.startsWith("warning") || lower.startsWith("⚠")) {
      return (
        <Box paddingX={1}>
          <Alert variant="warning">{entry.content}</Alert>
        </Box>
      );
    }
    if (lower.startsWith("switched") || lower.startsWith("connected") || lower.startsWith("done")) {
      return (
        <Box paddingX={1}>
          <Alert variant="success">{entry.content}</Alert>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" paddingX={1}>
        <Alert variant="info">{entry.content}</Alert>
      </Box>
    );
  }

  if (entry.role === "user") {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Box>
          <Badge color="green">You</Badge>
        </Box>
        <Box paddingLeft={2}>
          <Text color="white" wrap="wrap">
            {entry.content}
          </Text>
        </Box>
      </Box>
    );
  }

  if (entry.role === "assistant") {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Box>
          <Badge color="cyan">Agent</Badge>
        </Box>
        <Box paddingLeft={2}>
          <Text wrap="wrap">{entry.content}</Text>
        </Box>
      </Box>
    );
  }

  return null;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export function startInkChat(options: {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  profileId: string;
  mode: GatewayMode;
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
    />,
  );

  return waitUntilExit();
}
