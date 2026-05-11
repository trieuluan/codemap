import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const terminalKit = require("terminal-kit") as typeof import("terminal-kit");
const term = terminalKit.terminal;
import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, ChatToolCall, GatewayMode } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import { runAgentLoop, type ConfirmEditFn } from "../agent/agent-loop.js";
import { ContextCompactor } from "../agent/context-compactor.js";
import { hydrateMentionContext } from "../agent/mention-context.js";
import { executeCommand } from "../commands/index.js";
import {
  selectModelForMode,
  getRecommendedMode,
} from "../commands/route-policy.js";
import { createDebugLogger, type DebugLogger } from "../debug-logger.js";
import {
  renderMessage,
  renderTaskStatus,
  renderConfirmDialog,
  renderStatusLine,
  type WelcomeData,
} from "./renderer.js";
import { readLine } from "./input-handler.js";

export interface ChatEntry {
  role: "user" | "assistant" | "tool" | "system" | "welcome";
  content: string;
  toolName?: string;
  toolCalls?: ChatToolCall[];
  welcomeData?: WelcomeData;
}

export type TaskPhase = "idle" | "thinking" | "tool" | "streaming" | "done";

export interface TaskStatus {
  phase: TaskPhase;
  toolName?: string;
  toolArgs?: string;
  startTime?: number;
  endTime?: number;
  text?: string;
  toolsCalled: number;
  model?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface ChatTerminalOptions {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  profileId: string;
  mode: GatewayMode;
  availableModels?: string[];
}

export class ChatTerminal {
  private messages: ChatEntry[] = [];
  private history: ChatMessage[] = [];
  private inputHistory: string[] = [];
  private busy = false;
  private currentModel: string;
  private currentMode: GatewayMode;
  private debug: boolean;
  private autoAccept = false;
  private lastUserText: string | null = null;
  private streamAborted = false;
  private taskStatus: TaskStatus = { phase: "idle", toolsCalled: 0 };
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private logger: DebugLogger | null = null;
  private compactor: ContextCompactor;
  private options: ChatTerminalOptions;

  constructor(options: ChatTerminalOptions) {
    this.options = options;
    this.currentModel = options.model;
    this.currentMode = options.mode;
    this.debug = process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1";
    this.compactor = new ContextCompactor(options.provider);

    if (this.debug) {
      this.logger = createDebugLogger();
    }
  }

  async start(): Promise<void> {
    term.clear();
    term.grabInput(true);

    // Welcome banner
    this.messages.push({
      role: "welcome",
      content: "",
      welcomeData: {
        model: this.currentModel,
        mode: this.currentMode,
        profile: this.options.profileId,
        modelCount: this.options.availableModels?.length,
      },
    });

    this.renderAll();

    // Main input loop
    while (true) {
      const input = await readLine({
        term,
        inputHistory: this.inputHistory,
        onAbort: () => this.handleAbort(),
      });

      if (input === null && !this.lastUserText) {
        // Empty submit with no history — exit
        break;
      }

      if (input === null) {
        continue;
      }

      if (input === "/exit" || input === "/quit") {
        break;
      }

      this.inputHistory.push(input);
      await this.handleSubmit(input);
    }

    this.stopSpinner();
    term("\n");
    term.processExit(0);
  }

  private async handleSubmit(text: string): Promise<void> {
    if (this.busy) return;

    // Command dispatch
    if (text.startsWith("/")) {
      const handled = executeCommand(text, {
        currentModel: this.currentModel,
        currentMode: this.currentMode,
        profileId: this.options.profileId,
        history: this.history,
        availableModels: this.options.availableModels,
        toolClient: this.options.toolClient,
        setMessages: (updater) => {
          if (typeof updater === "function") {
            this.messages = updater(this.messages);
          } else {
            this.messages = updater;
          }
          this.renderAll();
        },
        setHistory: (updater) => {
          if (typeof updater === "function") {
            this.history = updater(this.history);
          } else {
            this.history = updater;
          }
        },
        setInputHistory: (updater) => {
          if (typeof updater === "function") {
            this.inputHistory = updater(this.inputHistory);
          } else {
            this.inputHistory = updater;
          }
        },
        setCurrentModel: (m) => {
          this.currentModel = m;
        },
        setCurrentMode: (m) => {
          this.currentMode = m;
        },
        setBusy: (b) => {
          this.busy = b;
        },
        debug: this.debug,
        setDebug: (d) => {
          this.debug = d;
          if (d && !this.logger) {
            this.logger = createDebugLogger();
          }
          if (!d) this.logger = null;
        },
        debugLogFile: this.logger?.logFile ?? null,
        lastUserText: this.lastUserText,
        resend: () => {
          if (this.lastUserText && !this.busy) {
            this.handleSubmit(this.lastUserText);
          }
        },
        exit: () => {
          this.stopSpinner();
          term.processExit(0);
        },
      });

      if (!handled) {
        this.messages.push({
          role: "system",
          content: "Unknown command. Type /help for available commands.",
        });
        this.renderAll();
      }
      return;
    }

    // Normal message — hydrate @mentions then run agent loop
    this.lastUserText = text;
    this.streamAborted = false;
    this.busy = true;

    this.messages.push({ role: "user", content: text });
    this.renderAll();

    this.taskStatus = {
      phase: "thinking",
      startTime: Date.now(),
      toolsCalled: 0,
      model: this.currentModel,
    };
    this.startSpinner();

    let streamingContent = "";
    let hasStreamingEntry = false;

    try {
      const mentionContext = await hydrateMentionContext(text);
      for (const warning of mentionContext.warnings) {
        this.messages.push({ role: "system", content: `⚠ ${warning}` });
      }

      const userMessage: ChatMessage = {
        role: "user",
        content: mentionContext.content,
      };

      const result = await runAgentLoop({
        provider: this.options.provider,
        model: this.currentModel,
        history: this.history,
        userMessage,
        toolClient: this.options.toolClient,
        debug: this.debug,
        compactor: this.compactor,
        confirmEdit: this.makeConfirmEdit(),
        onToken: (token) => {
          if (this.streamAborted) return;
          streamingContent += token;
          if (!hasStreamingEntry) {
            hasStreamingEntry = true;
            this.messages.push({
              role: "assistant",
              content: streamingContent,
            });
          } else {
            // Update last assistant message
            for (let i = this.messages.length - 1; i >= 0; i--) {
              if (
                this.messages[i].role === "assistant" &&
                !this.messages[i].toolName
              ) {
                this.messages[i] = {
                  ...this.messages[i],
                  content: streamingContent,
                };
                break;
              }
            }
          }
          this.taskStatus = {
            ...this.taskStatus,
            phase: "streaming",
            text: undefined,
          };
          this.renderAll();
        },
        onModel: (model) => {
          this.taskStatus = { ...this.taskStatus, model };
        },
        onUsage: (usage) => {
          this.taskStatus = { ...this.taskStatus, usage };
        },
        onToolStart: (name, args, id) => {
          this.logger?.logToolStart(name, args, id);
          streamingContent = "";
          hasStreamingEntry = false;
          this.taskStatus = {
            ...this.taskStatus,
            phase: "tool",
            toolName: name,
            toolArgs: args,
            toolsCalled: this.taskStatus.toolsCalled + 1,
            text: undefined,
          };
          this.messages.push({
            role: "tool",
            content: `Calling: ${name}(${args.length > 200 ? args.slice(0, 200) + "..." : args})`,
            toolName: name,
          });
          this.renderAll();
        },
        onToolResult: (name, resultText) => {
          this.logger?.logToolResult(name, resultText);
          streamingContent = "";
          hasStreamingEntry = false;
          this.taskStatus = {
            ...this.taskStatus,
            phase: "thinking",
            toolName: undefined,
            toolArgs: undefined,
          };
          this.messages.push({
            role: "tool",
            content: resultText,
            toolName: `${name} result`,
          });
          this.renderAll();
        },
        onDebug: (info) => {
          if (!this.debug) return;
          if (info.event === "stream_request") {
            this.logger?.logStreamRequest({
              model: String(info.model ?? ""),
              messageCount: Number(info.messageCount ?? 0),
              toolCount: Number(info.toolCount ?? 0),
              hasSystem: Boolean(info.hasSystem),
              toolsCalled: this.taskStatus.toolsCalled,
            });
          } else if (info.event === "tool_fallback") {
            this.logger?.logToolFallback(String(info.reason ?? ""));
          }
        },
      });

      this.stopSpinner();
      this.taskStatus = {
        ...this.taskStatus,
        phase: "done",
        endTime: Date.now(),
        text: undefined,
      };
      this.renderAll();

      // Write summary to debug log
      if (this.logger) {
        const toolCallsList = result.messages
          .filter((m) => m.role === "assistant" && m.toolCalls)
          .flatMap((m) => m.toolCalls ?? [])
          .map((tc) => tc.function.name);
        this.logger.logSummary({
          totalChunks: 0,
          textChunks: 0,
          toolCallChunks: toolCallsList.length,
          finalToolCalls: toolCallsList,
          model: this.currentModel,
        });
      }

      if (result.unsupportedToolCalling) {
        this.messages.push({
          role: "system",
          content: `Model "${this.currentModel}" does not support tool calling. Response was generated without tools.\nUse /model <name> to switch to a tool-capable model, or /mode to change gateway mode.`,
        });
      }

      // Finalize: update streaming entry to final text if different
      if (hasStreamingEntry && result.text) {
        for (let i = this.messages.length - 1; i >= 0; i--) {
          if (
            this.messages[i].role === "assistant" &&
            !this.messages[i].toolName
          ) {
            this.messages[i] = {
              ...this.messages[i],
              content: result.text || "(no response)",
            };
            break;
          }
        }
      } else if (!hasStreamingEntry) {
        this.messages.push({
          role: "assistant",
          content: result.text || "(no response)",
        });
      }

      this.renderAll();
      this.history.push(...result.messages);
    } catch (err) {
      this.stopSpinner();
      this.taskStatus = { phase: "idle", toolsCalled: 0 };
      this.logger?.logError(err);
      this.streamAborted = true;

      const errMsg = err instanceof Error ? err.message : String(err);
      const isModelBroken =
        errMsg.includes("zero-length") ||
        errMsg.includes("empty document") ||
        errMsg.includes("429");

      if (
        isModelBroken &&
        this.options.availableModels &&
        this.options.availableModels.length > 1
      ) {
        const recommendedModes = getRecommendedMode(
          this.currentModel,
          this.currentModel,
        );
        let newModel: string | null = null;
        let newMode = this.currentMode;
        for (const m of recommendedModes) {
          const candidate = selectModelForMode(
            this.options.availableModels,
            m,
            this.currentModel,
          );
          if (candidate) {
            newModel = candidate;
            newMode = m;
            break;
          }
        }
        if (!newModel) {
          newModel =
            this.options.availableModels.find(
              (m) => m !== this.currentModel,
            ) ?? null;
        }

        if (newModel) {
          this.currentModel = newModel;
          if (newMode !== this.currentMode) this.currentMode = newMode;
          this.messages.push({
            role: "system",
            content: `Model "${this.currentModel}" failed. Auto-switched to "${newModel}"${newMode !== this.currentMode ? ` (mode: ${newMode})` : ""}.\nType /retry to resend your message.`,
          });
        } else {
          this.messages.push({
            role: "system",
            content: `Model "${this.currentModel}" failed and no alternative model found.\nCheck gateway configuration.`,
          });
        }
      } else {
        this.messages.push({ role: "system", content: `Error: ${errMsg}` });
      }

      this.renderAll();
    }

    this.busy = false;
  }

  private makeConfirmEdit(): ConfirmEditFn {
    return (name, args, preview) => {
      if (this.autoAccept) return Promise.resolve(true);

      this.stopSpinner();
      renderConfirmDialog(term, { name, preview });
      term.yellow("  [y/n/a] ");

      return new Promise<boolean>((resolve) => {
        term.yesOrNo({ yes: ["y", "Y"], no: ["n", "N"] }, (err, result) => {
          if (err || !result) {
            resolve(false);
            return;
          }
          if (result === true) {
            resolve(true);
          } else {
            resolve(false);
          }
        });

        // Also listen for 'a' key for accept-all
        const onKey = (key: string) => {
          if (key === "a" || key === "A") {
            this.autoAccept = true;
            term.removeListener("key", onKey);
            resolve(true);
          }
        };
        term.on("key", onKey);
      });
    };
  }

  private handleAbort(): void {
    this.streamAborted = true;
    this.busy = false;
    this.stopSpinner();
    this.taskStatus = { phase: "idle", toolsCalled: 0 };
    this.messages.push({ role: "system", content: "Aborted." });
    this.renderAll();
  }

  private renderAll(): void {
    term.clear();

    // Render all messages
    for (const msg of this.messages) {
      renderMessage(term, msg);
    }

    // Render task status
    if (this.taskStatus.phase !== "idle") {
      renderTaskStatus(term, this.taskStatus, this.spinnerFrame);
    }

    // Render status line
    renderStatusLine(term, this.currentModel, this.currentMode, {
      debug: this.debug,
      autoAccept: this.autoAccept,
      historyCount: this.history.length,
    });
  }

  private startSpinner(): void {
    this.stopSpinner();
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame++;
      this.renderAll();
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }
}
