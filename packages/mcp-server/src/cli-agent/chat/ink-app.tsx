import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { render, Box, Text, useApp } from "ink";
import { Alert, Badge } from "@inkjs/ui";
import cfonts from "cfonts";
import type { NineRouterProvider } from "../provider.js";
import type { ChatMessage, ChatToolCall, GatewayMode } from "../types.js";
import { runAgentLoop } from "./agent-loop.js";
import { hydrateMentionContext } from "./mention-context.js";
import type { CodeMapMcpToolClient } from "./mcp-tool-client.js";
import { MentionInput } from "./mention-input.js";
import {
  getModeDisplay,
  selectModelForMode,
  getRecommendedMode,
} from "./route-policy.js";
import { executeCommand } from "./commands/index.js";
import { createDebugLogger, type DebugLogger } from "./debug-logger.js";
import { TaskStatusBar, type TaskStatus } from "./task-status-bar.js";

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
  const [taskStatus, setTaskStatus] = useState<TaskStatus>({ phase: "idle", toolsCalled: 0 });
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [debug, setDebug] = useState(
    process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1",
  );
  const [debugLogFile, setDebugLogFile] = useState<string | null>(null);
  const loggerRef = useRef<DebugLogger | null>(null);
  const debugRef = useRef(debug);
  debugRef.current = debug;
  const lastUserTextRef = useRef<string | null>(null);
  const streamAbortedRef = useRef(false);
  const taskStatusRef = useRef(taskStatus);
  taskStatusRef.current = taskStatus;
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

  // Init/destroy debug logger when debug toggles
  useEffect(() => {
    if (debug && !loggerRef.current) {
      const logger = createDebugLogger();
      loggerRef.current = logger;
      setDebugLogFile(logger.logFile);
    }
    if (!debug) {
      loggerRef.current = null;
      setDebugLogFile(null);
    }
  }, [debug]);

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
          debug,
          setDebug,
          debugLogFile,
          lastUserText: lastUserTextRef.current,
          resend,
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
      lastUserTextRef.current = text;
      streamAbortedRef.current = false;
      setTaskStatus({ phase: "thinking", startTime: Date.now(), toolsCalled: 0 });
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

        const result = await runAgentLoop({
          provider,
          model: currentModel,
          history,
          userMessage,
          toolClient,
          debug,
          onToken: (token) => {
            if (!streamAbortedRef.current) {
              setTaskStatus((prev) => ({
                ...prev,
                phase: "streaming",
                text: (prev.text ?? "") + token,
              }));
            }
          },
          onToolStart: (name, args, id) => {
            if (debugRef.current) {
              loggerRef.current?.logToolStart(name, args, id);
            }
            setTaskStatus((prev) => ({
              ...prev,
              phase: "tool",
              toolName: name,
              toolArgs: args,
              toolsCalled: prev.toolsCalled + 1,
              text: undefined,
            }));
            setMessages((prev) => [
              ...prev,
              {
                role: "tool",
                content: `Calling: ${name}(${args.length > 200 ? args.slice(0, 200) + "..." : args})`,
                toolName: name,
              },
            ]);
          },
          onToolResult: (name, resultText) => {
            if (debugRef.current) {
              loggerRef.current?.logToolResult(name, resultText);
            }
            setTaskStatus((prev) => ({
              ...prev,
              phase: "thinking",
              toolName: undefined,
              toolArgs: undefined,
            }));
            setMessages((prev) => [
              ...prev,
              {
                role: "tool",
                content: resultText,
                toolName: `${name} result`,
              },
            ]);
          },
          onDebug: (info) => {
            if (!debugRef.current) return;
            if (info.event === "stream_request") {
              loggerRef.current?.logStreamRequest({
                model: String(info.model ?? ""),
                messageCount: Number(info.messageCount ?? 0),
                toolCount: Number(info.toolCount ?? 0),
                hasSystem: Boolean(info.hasSystem),
                toolsCalled: taskStatusRef.current.toolsCalled,
              });
            } else if (info.event === "tool_fallback") {
              loggerRef.current?.logToolFallback(String(info.reason ?? ""));
            } else if (info.toolCalls) {
              // Tool call debug info — already logged via onToolStart
            } else {
              loggerRef.current?.logChunk(0, info);
            }
          },
        });

        setTaskStatus((prev) => ({
          ...prev,
          phase: "done",
          endTime: Date.now(),
          text: undefined,
        }));
        setTimeout(() => setTaskStatus({ phase: "idle", toolsCalled: 0 }), 5000);

        // Write summary to debug log
        if (loggerRef.current) {
          const toolCallsList = result.messages
            .filter((m) => m.role === "assistant" && m.toolCalls)
            .flatMap((m) => m.toolCalls ?? [])
            .map((tc) => tc.function.name);
          loggerRef.current.logSummary({
            totalChunks: 0,
            textChunks: 0,
            toolCallChunks: toolCallsList.length,
            finalToolCalls: toolCallsList,
            model: currentModel,
          });
        }

        // Only add final assistant response and any remaining entries
        const newEntries: ChatEntry[] = [
          { role: "assistant", content: result.text || "(no response)" },
        ];

        if (result.unsupportedToolCalling) {
          newEntries.push({
            role: "system",
            content: `Model "${currentModel}" does not support tool calling. Response was generated without tools.\nUse /model <name> to switch to a tool-capable model, or /mode to change gateway mode.`,
          });
        }

        setMessages((prev) => [...prev, ...newEntries]);

        setHistory((prev) => [...prev, ...result.messages]);
      } catch (err) {
        streamAbortedRef.current = true;
        setTaskStatus({ phase: "idle", toolsCalled: 0 });
        loggerRef.current?.logError(err);
        const errMsg = err instanceof Error ? err.message : String(err);
        const isModelBroken =
          errMsg.includes("zero-length") ||
          errMsg.includes("empty document") ||
          errMsg.includes("429");

        if (isModelBroken && availableModels && availableModels.length > 1) {
          // Auto-select next model from a different mode
          const recommendedModes = getRecommendedMode(
            currentModel,
            currentModel,
          );
          let newModel: string | null = null;
          let newMode = currentMode;
          for (const m of recommendedModes) {
            const candidate = selectModelForMode(
              availableModels,
              m,
              currentModel,
            );
            if (candidate) {
              newModel = candidate;
              newMode = m;
              break;
            }
          }
          // Fallback: any different model
          if (!newModel) {
            newModel = availableModels.find((m) => m !== currentModel) ?? null;
          }

          if (newModel) {
            setCurrentModel(newModel);
            if (newMode !== currentMode) setCurrentMode(newMode);
            setMessages((prev) => [
              ...prev,
              {
                role: "system",
                content: `Model "${currentModel}" failed. Auto-switched to "${newModel}"${newMode !== currentMode ? ` (mode: ${newMode})` : ""}.\nType /retry to resend your message.`,
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                role: "system",
                content: `Model "${currentModel}" failed and no alternative model found.\nCheck gateway configuration.`,
              },
            ]);
          }
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: `Error: ${errMsg}` },
          ]);
        }
      }

      setBusy(false);
    },
    [
      provider,
      currentModel,
      currentMode,
      history,
      toolClient,
      debug,
      debugLogFile,
      exit,
    ],
  );

  const handleUserSubmitRef = useRef(handleUserSubmit);
  handleUserSubmitRef.current = handleUserSubmit;

  const resend = useCallback(() => {
    const text = lastUserTextRef.current;
    if (text && !busyRef.current) {
      handleUserSubmitRef.current(text);
    }
  }, []);

  return (
    <Box flexDirection="column">
      {/* Chat messages */}
      <Box flexDirection="column">
        {messages.map((msg, i) => (
          <ChatBubble key={i} entry={msg} />
        ))}
      </Box>

      {/* Task status bar */}
      {taskStatus.phase !== "idle" && <TaskStatusBar status={taskStatus} />}

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
          <Badge color={getModeDisplay(currentMode).color}>
            {getModeDisplay(currentMode).label}
          </Badge>
        </Box>
        <Box gap={1}>
          {debug && <Badge color="red">DEBUG</Badge>}
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
    if (
      lower.startsWith("switched") ||
      lower.startsWith("connected") ||
      lower.startsWith("done")
    ) {
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
