import { createTerminal, terminalClear } from "terminui";
import { createInterface } from "node:readline";
import { createNodeBackendState, createNodeBackend } from "./node-backend.js";

import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, GatewayMode } from "../../types.js";
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
import { EventBus } from "./event-bus.js";
import { Store, createInitialState, type Message } from "./store.js";
import { render, type Terminal as TerminalType } from "./renderer.js";

// Re-export for backward compat with commands/index.ts
export type { Message as ChatEntry } from "./store.js";

interface ChatTerminalOptions {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  profileId: string;
  mode: GatewayMode;
  availableModels?: string[];
}

export class ChatTerminal {
  private bus: EventBus;
  private store: Store;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private logger: DebugLogger | null = null;
  private compactor: ContextCompactor;
  private options: ChatTerminalOptions;
  private inputActive = false;
  private terminal: TerminalType;
  private nodeBackendState: ReturnType<typeof createNodeBackendState>;

  constructor(options: ChatTerminalOptions) {
    this.options = options;
    this.bus = new EventBus();
    this.compactor = new ContextCompactor(options.provider);

    const debug = process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1";

    this.store = new Store(
      createInitialState({
        model: options.model,
        mode: options.mode,
        profile: options.profileId,
        availableModels: options.availableModels,
        debug,
      }),
      this.bus,
    );

    if (debug) {
      this.logger = createDebugLogger();
    }

    // Set up terminui terminal
    this.nodeBackendState = createNodeBackendState();
    const backend = createNodeBackend(this.nodeBackendState);
    this.terminal = createTerminal(backend);

    // Listen for screen refresh
    this.bus.on("screen:refresh", () => {
      this.redraw();
    });

    // Listen for resize
    process.stdout.on("resize", () => {
      const w = process.stdout.columns || 80;
      const h = process.stdout.rows || 24;
      this.store.dispatch({
        viewport: { width: w, height: h },
      });
    });
  }

  async start(): Promise<void> {
    terminalClear(this.terminal);

    // Add welcome message
    const state = this.store.getState();
    this.store.dispatch({
      messages: [
        {
          role: "welcome",
          content: "",
          welcomeData: {
            model: state.config.model,
            mode: state.config.mode,
            profile: state.config.profile,
            modelCount: state.config.availableModels.length,
          },
        },
      ],
    });

    this.redraw();

    // Main input loop
    while (true) {
      const state = this.store.getState();
      this.inputActive = true;
      const input = await this.readLine();
      this.inputActive = false;

      if (input === null && !state.input.lastUserText) {
        break;
      }

      if (input === null) {
        continue;
      }

      if (input === "/exit" || input === "/quit") {
        break;
      }

      this.store.dispatch({
        input: { ...state.input, history: [...state.input.history, input] },
      });

      await this.handleSubmit(input);
    }

    this.stopSpinner();
    process.exit(0);
  }

  private async readLine(): Promise<string | null> {
    const state = this.store.getState();

    // Print input box top border
    const boxW = Math.min(state.viewport.width - 4, 76);
    const innerW = boxW - 2;
    const hLine = "─".repeat(innerW - 8);

    process.stdout.write("\n  ");
    process.stdout.write(`\x1b[90m┌─ Input ─${hLine}┐\x1b[0m`);
    process.stdout.write("\n  ");
    process.stdout.write("\x1b[90m│ \x1b[0m");
    process.stdout.write("\x1b[1;36m> \x1b[0m");

    return new Promise<string | null>((resolve) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        history: [...state.input.history],
        removeHistoryDuplicates: true,
      });

      rl.on("line", (line) => {
        const trimmed = line.trim();

        // Print bottom border
        const hLineBottom = "─".repeat(innerW);
        process.stdout.write(`\n  \x1b[90m└${hLineBottom}┘\x1b[0m\n`);

        rl.close();
        if (!trimmed) {
          resolve(null);
          return;
        }
        resolve(trimmed);
      });

      rl.on("close", () => {
        resolve(null);
      });

      // Handle Ctrl+C
      process.stdin.once("data", (data) => {
        if (data[0] === 0x03) { // Ctrl+C
          const hLineBottom = "─".repeat(innerW);
          process.stdout.write(`\n  \x1b[90m└${hLineBottom}┘\x1b[0m\n`);
          rl.close();
          resolve(null);
        }
      });
    });
  }

  private async handleSubmit(text: string): Promise<void> {
    const state = this.store.getState();
    if (state.input.busy) return;

    // Command dispatch
    if (text.startsWith("/")) {
      const handled = executeCommand(text, this.buildCommandContext());
      if (!handled) {
        this.appendMessage({
          role: "system",
          content: "Unknown command. Type /help for available commands.",
        });
      }
      return;
    }

    // Normal message
    this.store.dispatch({
      input: { ...state.input, busy: true, lastUserText: text },
    });

    this.appendMessage({ role: "user", content: text });

    this.store.dispatch({
      task: {
        phase: "thinking",
        startTime: Date.now(),
        toolsCalled: 0,
        model: this.store.getState().config.model,
      },
    });
    this.startSpinner();

    let streamingContent = "";
    let hasStreamingEntry = false;

    try {
      const mentionContext = await hydrateMentionContext(text);
      for (const warning of mentionContext.warnings) {
        this.appendMessage({ role: "system", content: `⚠ ${warning}` });
      }

      const userMessage: ChatMessage = {
        role: "user",
        content: mentionContext.content,
      };

      const result = await runAgentLoop({
        provider: this.options.provider,
        model: this.store.getState().config.model,
        history: this.store.getState().agentHistory as ChatMessage[],
        userMessage,
        toolClient: this.options.toolClient,
        debug: this.store.getState().debug,
        compactor: this.compactor,
        confirmEdit: this.makeConfirmEdit(),
        onToken: (token) => {
          const s = this.store.getState();
          if (!s.task || s.task.phase === "idle") return;
          streamingContent += token;
          if (!hasStreamingEntry) {
            hasStreamingEntry = true;
            this.appendMessage({
              role: "assistant",
              content: streamingContent,
            });
          } else {
            this.updateLastAssistantMessage(streamingContent);
          }
          this.store.dispatch({
            task: { ...s.task, phase: "streaming" },
          });
          this.bus.scheduleRefresh();
        },
        onModel: (model) => {
          const s = this.store.getState();
          this.store.dispatch({
            task: { ...s.task, model },
          });
        },
        onUsage: (usage) => {
          const s = this.store.getState();
          this.store.dispatch({
            task: { ...s.task, usage },
          });
        },
        onToolStart: (name, args, id) => {
          this.logger?.logToolStart(name, args, id);
          streamingContent = "";
          hasStreamingEntry = false;
          const s = this.store.getState();
          this.store.dispatch({
            task: {
              ...s.task,
              phase: "tool",
              toolName: name,
              toolArgs: args,
              toolsCalled: s.task.toolsCalled + 1,
            },
          });
          this.appendMessage({
            role: "tool",
            content: `Calling: ${name}(${args.length > 200 ? args.slice(0, 200) + "..." : args})`,
            toolName: name,
          });
        },
        onToolResult: (name, resultText) => {
          this.logger?.logToolResult(name, resultText);
          streamingContent = "";
          hasStreamingEntry = false;
          const s = this.store.getState();
          this.store.dispatch({
            task: {
              ...s.task,
              phase: "thinking",
              toolName: undefined,
              toolArgs: undefined,
            },
          });
          this.appendMessage({
            role: "tool",
            content: resultText,
            toolName: `${name} result`,
          });
        },
        onDebug: (info) => {
          if (!this.store.getState().debug) return;
          if (info.event === "stream_request") {
            this.logger?.logStreamRequest({
              model: String(info.model ?? ""),
              messageCount: Number(info.messageCount ?? 0),
              toolCount: Number(info.toolCount ?? 0),
              hasSystem: Boolean(info.hasSystem),
              toolsCalled: this.store.getState().task.toolsCalled,
            });
          } else if (info.event === "tool_fallback") {
            this.logger?.logToolFallback(String(info.reason ?? ""));
          }
        },
      });

      this.stopSpinner();
      const s = this.store.getState();
      this.store.dispatch({
        task: { ...s.task, phase: "done", endTime: Date.now() },
      });

      // Debug log summary
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
          model: this.store.getState().config.model,
        });
      }

      if (result.unsupportedToolCalling) {
        const cs = this.store.getState().config;
        this.appendMessage({
          role: "system",
          content: `Model "${cs.model}" does not support tool calling. Response was generated without tools.\nUse /model <name> to switch to a tool-capable model, or /mode to change gateway mode.`,
        });
      }

      // Finalize streaming
      if (hasStreamingEntry && result.text) {
        this.updateLastAssistantMessage(result.text || "(no response)");
      } else if (!hasStreamingEntry) {
        this.appendMessage({
          role: "assistant",
          content: result.text || "(no response)",
        });
      }

      this.bus.scheduleRefresh();

      // Update agent history
      this.store.dispatch((prev) => ({
        agentHistory: [
          ...(prev.agentHistory as ChatMessage[]),
          ...result.messages,
        ],
      }));
    } catch (err) {
      this.stopSpinner();
      this.store.dispatch({
        task: { phase: "idle", toolsCalled: 0 },
      });
      this.logger?.logError(err);

      const errMsg = err instanceof Error ? err.message : String(err);
      const isModelBroken =
        errMsg.includes("zero-length") ||
        errMsg.includes("empty document") ||
        errMsg.includes("429");

      const cs = this.store.getState().config;

      if (isModelBroken && cs.availableModels.length > 1) {
        const recommendedModes = getRecommendedMode(cs.model, cs.model);
        let newModel: string | null = null;
        let newMode = cs.mode;
        for (const m of recommendedModes) {
          const candidate = selectModelForMode(cs.availableModels, m, cs.model);
          if (candidate) {
            newModel = candidate;
            newMode = m;
            break;
          }
        }
        if (!newModel) {
          newModel = cs.availableModels.find((m) => m !== cs.model) ?? null;
        }

        if (newModel) {
          this.store.dispatch({
            config: { ...cs, model: newModel, mode: newMode },
          });
          this.appendMessage({
            role: "system",
            content: `Model "${cs.model}" failed. Auto-switched to "${newModel}"${newMode !== cs.mode ? ` (mode: ${newMode})` : ""}.\nType /retry to resend your message.`,
          });
        } else {
          this.appendMessage({
            role: "system",
            content: `Model "${cs.model}" failed and no alternative model found.\nCheck gateway configuration.`,
          });
        }
      } else {
        this.appendMessage({ role: "system", content: `Error: ${errMsg}` });
      }
    }

    this.store.dispatch((prev) => ({
      input: { ...prev.input, busy: false },
    }));
  }

  private makeConfirmEdit(): ConfirmEditFn {
    return async (name, args, preview) => {
      const state = this.store.getState();
      if (state.input.autoAccept) return true;

      this.stopSpinner();
      this.store.dispatch({
        confirm: { active: true, toolName: name, preview },
      });
      this.inputActive = true;
      this.redraw();

      const result = await this.promptYesNo(name);
      this.store.dispatch({
        confirm: { active: false, toolName: "", preview: null },
      });
      this.inputActive = false;

      return result;
    };
  }

  private async promptYesNo(toolName: string): Promise<boolean> {
    process.stdout.write(`\n  \x1b[33m${toolName}\x1b[0m wants to edit files. Proceed? [y/n/a(ll)] `);

    return new Promise<boolean>((resolve) => {
      const onData = (data: Buffer) => {
        const key = data.toString().toLowerCase();
        process.stdin.removeListener("data", onData);
        if (key === "y") {
          process.stdout.write("yes\n");
          resolve(true);
        } else if (key === "a") {
          process.stdout.write("accept all\n");
          this.store.dispatch({
            input: { ...this.store.getState().input, autoAccept: true },
          });
          resolve(true);
        } else {
          process.stdout.write("no\n");
          resolve(false);
        }
      };
      process.stdin.on("data", onData);
    });
  }

  // ─── Message helpers ─────────────────────────────────

  private appendMessage(msg: Message): void {
    this.store.dispatch((prev) => ({
      messages: [...prev.messages, msg],
    }));
  }

  private updateLastAssistantMessage(content: string): void {
    this.store.dispatch((prev) => {
      const msgs = [...prev.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i]!.role === "assistant" && !msgs[i]!.toolName) {
          msgs[i] = { ...msgs[i]!, content };
          break;
        }
      }
      return { messages: msgs };
    });
  }

  // ─── Command context builder ─────────────────────────

  private buildCommandContext() {
    const s = this.store.getState();
    return {
      currentModel: s.config.model,
      currentMode: s.config.mode,
      profileId: s.config.profile,
      history: s.agentHistory as ChatMessage[],
      availableModels: s.config.availableModels,
      toolClient: this.options.toolClient,
      setMessages: (updater: Message[] | ((prev: Message[]) => Message[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({
            messages: updater(prev.messages),
          }));
        } else {
          this.store.dispatch({ messages: updater });
        }
      },
      setHistory: (
        updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]),
      ) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({
            agentHistory: updater(prev.agentHistory as ChatMessage[]),
          }));
        } else {
          this.store.dispatch({ agentHistory: updater });
        }
      },
      setInputHistory: (updater: string[] | ((prev: string[]) => string[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({
            input: { ...prev.input, history: updater(prev.input.history) },
          }));
        } else {
          this.store.dispatch((prev) => ({
            input: { ...prev.input, history: updater },
          }));
        }
      },
      setCurrentModel: (m: string) => {
        this.store.dispatch((prev) => ({
          config: { ...prev.config, model: m },
        }));
      },
      setCurrentMode: (m: GatewayMode) => {
        this.store.dispatch((prev) => ({
          config: { ...prev.config, mode: m },
        }));
      },
      setBusy: (b: boolean) => {
        this.store.dispatch((prev) => ({
          input: { ...prev.input, busy: b },
        }));
      },
      debug: s.debug,
      setDebug: (d: boolean) => {
        this.store.dispatch({ debug: d });
        if (d && !this.logger) {
          this.logger = createDebugLogger();
        }
        if (!d) this.logger = null;
      },
      debugLogFile: this.logger?.logFile ?? null,
      lastUserText: s.input.lastUserText,
      resend: () => {
        const cs = this.store.getState();
        if (cs.input.lastUserText && !cs.input.busy) {
          this.handleSubmit(cs.input.lastUserText);
        }
      },
      exit: () => {
        this.stopSpinner();
        process.exit(0);
      },
    };
  }

  // ─── Rendering ───────────────────────────────────────

  private redraw(): void {
    if (this.inputActive) return;
    const state = this.store.getState();
    render(this.terminal, state, this.spinnerFrame);
  }

  private startSpinner(): void {
    this.stopSpinner();
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame++;
      this.redraw();
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }
}
