import type { NineRouterProvider } from "../../provider.js";
import type { ChatMessage, GatewayMode, TokenUsage } from "../../types.js";
import type { CodeMapMcpToolClient } from "../mcp/mcp-tool-client.js";
import { runAgentLoop, type ConfirmEditFn } from "../agent/agent-loop.js";
import { ContextCompactor } from "../agent/context-compactor.js";
import { hydrateMentionContext } from "../agent/mention-context.js";
import { executeCommand } from "../commands/index.js";
import {
  selectModelForMode,
  getRecommendedMode,
} from "../commands/route-policy.js";
import { tryGetCurrentWorkspaceInfo } from "../../../lib/workspace-git.js";
import { createDebugLogger, type DebugLogger } from "../debug-logger.js";
import { EventBus } from "./event-bus.js";
import { Store, createInitialState, type Message } from "./store.js";

// Re-export for backward compat with commands/index.ts
export type { Message as ChatEntry } from "./store.js";

function subtractUsage(next: TokenUsage, prev: TokenUsage): TokenUsage {
  return {
    promptTokens: Math.max(0, next.promptTokens - prev.promptTokens),
    completionTokens: Math.max(0, next.completionTokens - prev.completionTokens),
    totalTokens: Math.max(0, next.totalTokens - prev.totalTokens),
  };
}

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
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
  // Public so App and InputArea can access
  readonly bus: EventBus;
  readonly store: Store;

  private _confirmResolve: ((accept: boolean) => void) | null = null;
  private logger: DebugLogger | null = null;
  private compactor: ContextCompactor;
  private options: ChatTerminalOptions;

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

    if (debug) this.logger = createDebugLogger();

    // Viewport resize → store update
    process.stdout.on("resize", () => {
      this.store.dispatch({
        viewport: { width: process.stdout.columns || 80, height: process.stdout.rows || 24 },
      });
    });
  }

  // ─── Public API for components ───────────────────────────

  resolveConfirm(accept: boolean): void {
    this._confirmResolve?.(accept);
    this._confirmResolve = null;
    this.store.dispatch({ confirm: { active: false, toolName: "", preview: null } });
  }

  resolveConfirmAll(): void {
    this.store.dispatch((prev) => ({ input: { ...prev.input, autoAccept: true } }));
    this.resolveConfirm(true);
  }

  // ─── Start ───────────────────────────────────────────────

  async start(): Promise<void> {
    // Git workspace info (non-blocking)
    tryGetCurrentWorkspaceInfo()
      .then((info) => {
        if (info) this.store.dispatch({ workspace: { repoName: info.repoName, branch: info.branch } });
      })
      .catch(() => {});

    const { startPiTuiApp } = await import("./pi-tui-app.js");
    await startPiTuiApp(this);
  }

  // ─── Submit ──────────────────────────────────────────────

  async handleSubmit(text: string): Promise<void> {
    const state = this.store.getState();
    if (state.input.busy) return;

    // Command dispatch
    if (text.startsWith("/")) {
      if (text === "/help") {
        this.store.dispatch({ screen: "help" });
        return;
      }
      const handled = executeCommand(text, this.buildCommandContext());
      if (!handled) {
        this.appendMessage({ role: "system", content: "Unknown command. Type /help for available commands." });
      }
      return;
    }

    this.store.dispatch({ input: { ...state.input, busy: true, lastUserText: text } });
    this.appendMessage({ role: "user", content: text });
    this.store.dispatch({
      task: {
        phase: "thinking",
        startTime: Date.now(),
        toolsCalled: 0,
        model: this.store.getState().config.model,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    });

    let streamingContent = "";
    let hasStreamingEntry = false;
    let lastTurnUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      const mentionContext = await hydrateMentionContext(text);
      for (const warning of mentionContext.warnings) {
        this.appendMessage({ role: "system", content: `⚠ ${warning}` });
      }

      const result = await runAgentLoop({
        provider: this.options.provider,
        model: this.store.getState().config.model,
        history: this.store.getState().agentHistory as ChatMessage[],
        userMessage: { role: "user", content: mentionContext.content },
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
            this.appendMessage({ role: "assistant", content: streamingContent });
          } else {
            this.updateLastAssistantMessage(streamingContent);
          }
          this.store.dispatch({ task: { ...s.task, phase: "streaming" } });
          this.bus.scheduleRefresh();
        },
        onModel: (model) => {
          this.store.dispatch({ task: { ...this.store.getState().task, model } });
        },
        onUsage: (usage) => {
          const delta = subtractUsage(usage, lastTurnUsage);
          lastTurnUsage = usage;
          this.store.dispatch((prev) => ({
            task: { ...prev.task, usage },
            sessionUsage: addUsage(prev.sessionUsage, delta),
          }));
        },
        onToolStart: (name, args, id) => {
          this.logger?.logToolStart(name, args, id);
          streamingContent = ""; hasStreamingEntry = false;
          const s = this.store.getState();
          this.store.dispatch({
            task: { ...s.task, phase: "tool", toolName: name, toolArgs: args, toolsCalled: s.task.toolsCalled + 1 },
          });
          this.appendMessage({
            role: "tool",
            content: `Calling: ${name}(${args.length > 200 ? args.slice(0, 200) + "..." : args})`,
            toolName: name,
          });
        },
        onToolResult: (name, resultText) => {
          this.logger?.logToolResult(name, resultText);
          streamingContent = ""; hasStreamingEntry = false;
          this.store.dispatch({
            task: { ...this.store.getState().task, phase: "thinking", toolName: undefined, toolArgs: undefined },
          });
          this.appendMessage({ role: "tool", content: resultText, toolName: `${name} result` });
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

      const s = this.store.getState();
      this.store.dispatch({ task: { ...s.task, phase: "done", endTime: Date.now() } });

      if (this.logger) {
        const toolCallsList = result.messages
          .filter((m) => m.role === "assistant" && m.toolCalls)
          .flatMap((m) => m.toolCalls ?? [])
          .map((tc) => tc.function.name);
        this.logger.logSummary({
          totalChunks: 0, textChunks: 0,
          toolCallChunks: toolCallsList.length,
          finalToolCalls: toolCallsList,
          model: this.store.getState().config.model,
        });
      }

      if (result.unsupportedToolCalling) {
        const cs = this.store.getState().config;
        this.appendMessage({
          role: "system",
          content: `Model "${cs.model}" does not support tool calling.\nUse /model <name> to switch to a tool-capable model, or /mode to change gateway mode.`,
        });
      }

      if (hasStreamingEntry && result.text) {
        this.updateLastAssistantMessage(result.text || "(no response)");
      } else if (!hasStreamingEntry) {
        this.appendMessage({ role: "assistant", content: result.text || "(no response)" });
      }

      this.bus.scheduleRefresh();
      this.store.dispatch((prev) => ({
        agentHistory: [...(prev.agentHistory as ChatMessage[]), ...result.messages],
      }));
    } catch (err) {
      this.store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
      this.logger?.logError(err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const isModelBroken =
        errMsg.includes("zero-length") || errMsg.includes("empty document") || errMsg.includes("429");
      const cs = this.store.getState().config;

      if (isModelBroken && cs.availableModels.length > 1) {
        let newModel: string | null = null;
        let newMode = cs.mode;
        for (const m of getRecommendedMode(cs.model, cs.model)) {
          const candidate = selectModelForMode(cs.availableModels, m, cs.model);
          if (candidate) { newModel = candidate; newMode = m; break; }
        }
        if (!newModel) newModel = cs.availableModels.find((m) => m !== cs.model) ?? null;
        if (newModel) {
          this.store.dispatch({ config: { ...cs, model: newModel, mode: newMode } });
          this.appendMessage({
            role: "system",
            content: `Model "${cs.model}" failed. Auto-switched to "${newModel}"${newMode !== cs.mode ? ` (mode: ${newMode})` : ""}.\nType /retry to resend your message.`,
          });
        } else {
          this.appendMessage({ role: "system", content: `Model "${cs.model}" failed and no alternative found.` });
        }
      } else {
        this.appendMessage({ role: "system", content: `Error: ${errMsg}` });
      }
    }

    this.store.dispatch((prev) => ({ input: { ...prev.input, busy: false } }));
  }

  // ─── Confirm edit ─────────────────────────────────────────

  private makeConfirmEdit(): ConfirmEditFn {
    return async (name, args, preview) => {
      if (this.store.getState().input.autoAccept) return true;
      this.store.dispatch({ confirm: { active: true, toolName: name, preview } });
      const result = await new Promise<boolean>((resolve) => {
        this._confirmResolve = resolve;
      });
      return result;
    };
  }

  // ─── Message helpers ──────────────────────────────────────

  private appendMessage(msg: Message): void {
    this.store.dispatch((prev) => ({
      messages: [...prev.messages, { timestamp: Date.now(), ...msg }],
      ...(prev.messageScroll.autoScroll ? { messageScroll: { offset: 0, autoScroll: true } } : {}),
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

  // ─── Command context ──────────────────────────────────────

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
          this.store.dispatch((prev) => ({ messages: updater(prev.messages) }));
        } else {
          this.store.dispatch({ messages: updater });
        }
      },
      setHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({ agentHistory: updater(prev.agentHistory as ChatMessage[]) }));
        } else {
          this.store.dispatch({ agentHistory: updater });
        }
      },
      setInputHistory: (updater: string[] | ((prev: string[]) => string[])) => {
        if (typeof updater === "function") {
          this.store.dispatch((prev) => ({ input: { ...prev.input, history: updater(prev.input.history) } }));
        } else {
          this.store.dispatch((prev) => ({ input: { ...prev.input, history: updater } }));
        }
      },
      setCurrentModel: (m: string) => {
        this.store.dispatch((prev) => ({ config: { ...prev.config, model: m } }));
      },
      setCurrentMode: (m: GatewayMode) => {
        this.store.dispatch((prev) => ({ config: { ...prev.config, mode: m } }));
      },
      setBusy: (b: boolean) => {
        this.store.dispatch((prev) => ({ input: { ...prev.input, busy: b } }));
      },
      debug: s.debug,
      setDebug: (d: boolean) => {
        this.store.dispatch({ debug: d });
        if (d && !this.logger) this.logger = createDebugLogger();
        if (!d) this.logger = null;
      },
      debugLogFile: this.logger?.logFile ?? null,
      lastUserText: s.input.lastUserText,
      resend: () => {
        const cs = this.store.getState();
        if (cs.input.lastUserText && !cs.input.busy) this.handleSubmit(cs.input.lastUserText);
      },
      exit: () => {
        process.stdout.write("\x1b[?1000l\x1b[?1006l");
        process.exit(0);
      },
    };
  }
}
