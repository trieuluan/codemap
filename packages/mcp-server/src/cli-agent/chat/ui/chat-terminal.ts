import { createTerminal, terminalClear, terminalShowCursor } from "terminui";
import type { Terminal } from "terminui";

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
import readline from "node:readline";
import { tryGetCurrentWorkspaceInfo } from "../../../lib/workspace-git.js";
import { createDebugLogger, type DebugLogger } from "../debug-logger.js";
import { EventBus } from "./event-bus.js";
import { Store, createInitialState, type Message } from "./store.js";
import { render, getInputCursorPos } from "./renderer.js";
import { createNodeBackend } from "./node-backend.js";

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
  private terminal: Terminal;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private logger: DebugLogger | null = null;
  private compactor: ContextCompactor;
  private options: ChatTerminalOptions;

  constructor(options: ChatTerminalOptions) {
    this.options = options;
    this.bus = new EventBus();
    this.compactor = new ContextCompactor(options.provider);
    this.terminal = createTerminal(createNodeBackend(), { viewport: "fullscreen" });

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

    // Enable SGR extended mouse tracking so the scroll wheel is sent to stdin
    // instead of being intercepted by the terminal emulator's scroll buffer.
    process.stdout.write("\x1b[?1000h\x1b[?1006h");

    // readline.emitKeypressEvents makes stdin emit 'keypress' events with proper
    // Unicode support — this fixes Vietnamese (and all IME) input in raw mode.
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setEncoding("utf8");

    // Populate git workspace info (non-blocking — UI renders before this resolves)
    tryGetCurrentWorkspaceInfo().then((info) => {
      if (info) {
        this.store.dispatch({
          workspace: { repoName: info.repoName, branch: info.branch },
        });
      }
    }).catch(() => { /* ignore if not a git repo */ });

    // Main input loop — key-by-key stdin, input rendered by terminui
    while (true) {
      const currentScreen = this.store.getState().screen;

      if (currentScreen === "help") {
        // Full-screen screens: any key transitions to main
        await this.readAnyKey();
        this.store.dispatch({ screen: "main" });
        this.redraw();
        continue;
      }

      // Main chat screen: read typed input
      this.store.dispatch({ inputActive: true, inputText: "", inputCursor: 0 });
      this.redraw();

      const input = await this.readKey();
      this.store.dispatch({ inputActive: false, inputText: "", inputCursor: 0 });

      if (input === null && !this.store.getState().input.lastUserText) {
        break;
      }

      if (input === null) {
        continue;
      }

      if (input === "/exit" || input === "/quit") {
        break;
      }

      this.store.dispatch((prev) => ({
        input: { ...prev.input, history: [...prev.input.history, input] },
      }));

      await this.handleSubmit(input);
    }

    this.stopSpinner();
    terminalShowCursor(this.terminal);
    process.stdout.write("\x1b[?1000l\x1b[?1006l");
    process.exit(0);
  }

  /** Wait for a single keypress — used by startup/help screens to dismiss */
  private async readAnyKey(): Promise<void> {
    if (!process.stdin.isTTY) return;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    return new Promise<void>((resolve) => {
      const onData = () => {
        process.stdin.removeListener("data", onData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      };
      process.stdin.on("data", onData);
    });
  }

  private async readKey(): Promise<string | null> {
    if (!process.stdin.isTTY) return null;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let text = "";
    let cursor = 0;
    const historyIdx = { current: -1 };
    const history = this.store.getState().input.history;

    type KpKey = { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string };

    return new Promise<string | null>((resolve) => {
      let finished = false;

      const cleanup = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (process.stdin as any).removeListener("keypress", onKeypress);
        process.stdin.removeListener("data", onMouseData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
      };

      const finish = (result: string | null) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(result);
      };

      const sync = () => {
        this.store.dispatchImmediate({ inputText: text, inputCursor: cursor });
      };

      const charLen = () => [...text].length;

      // ── Mouse scroll (SGR: \x1b[<64/65;...) ─────────────
      const onMouseData = (data: Buffer | string) => {
        const s = typeof data === "string" ? data : data.toString("utf8");
        if (!s.startsWith("\x1b[<")) return;
        const m = s.match(/^\x1b\[<(\d+);/);
        if (!m) return;
        const btn = parseInt(m[1]!, 10);
        if (btn === 64) {
          const st = this.store.getState();
          this.store.dispatch({ messageScroll: { offset: st.messageScroll.offset + 3, autoScroll: false } });
        } else if (btn === 65) {
          const st = this.store.getState();
          const newOffset = Math.max(0, st.messageScroll.offset - 3);
          this.store.dispatch({ messageScroll: { offset: newOffset, autoScroll: newOffset === 0 } });
        }
      };

      // ── Keyboard (readline keypress — handles all Unicode/IME) ───
      const onKeypress = (str: string | undefined, key: KpKey | undefined) => {
        if (!key) return;

        if (key.name === "return") { finish(text.trim() || null); return; }
        if (key.ctrl && key.name === "c") { finish(null); return; }
        if (key.ctrl && key.name === "d" && text.length === 0) { finish(null); return; }

        if (key.name === "backspace") {
          if (cursor > 0) {
            const arr = [...text]; arr.splice(cursor - 1, 1);
            text = arr.join(""); cursor--;
          }
          sync(); return;
        }

        if (key.name === "delete") {
          const arr = [...text];
          if (cursor < arr.length) { arr.splice(cursor, 1); text = arr.join(""); }
          sync(); return;
        }

        if (key.name === "left")  { if (cursor > 0) cursor--; sync(); return; }
        if (key.name === "right") { if (cursor < charLen()) cursor++; sync(); return; }

        if (key.name === "up") {
          if (history.length > 0) {
            historyIdx.current = Math.min(historyIdx.current + 1, history.length - 1);
            text = history[history.length - 1 - historyIdx.current] || "";
            cursor = charLen();
            sync();
          }
          return;
        }

        if (key.name === "down") {
          if (historyIdx.current > 0) {
            historyIdx.current--;
            text = history[history.length - 1 - historyIdx.current] || "";
            cursor = charLen();
          } else {
            historyIdx.current = -1; text = ""; cursor = 0;
          }
          sync(); return;
        }

        if (key.name === "pageup"  || (key.ctrl && key.name === "up")) {
          const st = this.store.getState();
          this.store.dispatch({ messageScroll: { offset: st.messageScroll.offset + 8, autoScroll: false } });
          return;
        }
        if (key.name === "pagedown" || (key.ctrl && key.name === "down")) {
          const st = this.store.getState();
          const newOffset = Math.max(0, st.messageScroll.offset - 8);
          this.store.dispatch({ messageScroll: { offset: newOffset, autoScroll: newOffset === 0 } });
          return;
        }

        if (key.ctrl && key.name === "a") { cursor = 0; sync(); return; }
        if (key.ctrl && key.name === "e") { cursor = charLen(); sync(); return; }
        if (key.ctrl && key.name === "k") { text = [...text].slice(0, cursor).join(""); sync(); return; }
        if (key.ctrl && key.name === "u") { text = [...text].slice(cursor).join(""); cursor = 0; sync(); return; }

        // Printable — includes Vietnamese, emoji, all Unicode
        if (str && !key.ctrl && !key.meta) {
          for (const ch of str) {
            const cp = ch.codePointAt(0) ?? 0;
            if (cp >= 0x20 && cp !== 0x7f) {
              const arr = [...text]; arr.splice(cursor, 0, ch);
              text = arr.join(""); cursor++;
            }
          }
          sync();
        }
      };

      process.stdin.on("data", onMouseData);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdin as any).on("keypress", onKeypress);
    });
  }

  private async handleSubmit(text: string): Promise<void> {
    const state = this.store.getState();
    if (state.input.busy) return;

    // Command dispatch
    if (text.startsWith("/")) {
      // Screen-transitioning commands
      if (text === "/help") {
        this.store.dispatch({ screen: "help" });
        return;
      }

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
      this.redraw();

      const result = await this.promptYesNo(name);
      this.store.dispatch({
        confirm: { active: false, toolName: "", preview: null },
      });

      return result;
    };
  }

  private async promptYesNo(_toolName: string): Promise<boolean> {
    if (!process.stdin.isTTY) return false;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    return new Promise<boolean>((resolve) => {
      const onData = (data: Buffer) => {
        const key = data.toString().toLowerCase();
        process.stdin.removeListener("data", onData);
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();

        if (key === "y") {
          resolve(true);
        } else if (key === "a") {
          this.store.dispatch({
            input: { ...this.store.getState().input, autoAccept: true },
          });
          resolve(true);
        } else {
          resolve(false);
        }
      };
      process.stdin.on("data", onData);
    });
  }

  // ─── Message helpers ─────────────────────────────────

  private appendMessage(msg: Message): void {
    this.store.dispatch((prev) => ({
      messages: [...prev.messages, { timestamp: Date.now(), ...msg }],
      ...(prev.messageScroll.autoScroll
        ? { messageScroll: { offset: 0, autoScroll: true } }
        : {}),
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
        terminalShowCursor(this.terminal);
        process.stdout.write("\x1b[?1000l\x1b[?1006l");
        process.exit(0);
      },
    };
  }

  // ─── Rendering ───────────────────────────────────────

  private redraw(): void {
    const state = this.store.getState();
    render(this.terminal, state, this.spinnerFrame);

    // Move the real terminal cursor to the input insertion point so macOS IME
    // can locate the composition popup. Without a visible cursor at the right
    // position, the OS input pipeline never activates IME composition.
    const pos = getInputCursorPos();
    if (pos && state.inputActive) {
      // ANSI cursor position is 1-indexed; show cursor so IME sees it
      process.stdout.write(`\x1b[${pos.row + 1};${pos.col + 1}H\x1b[?25h`);
    } else {
      process.stdout.write("\x1b[?25l"); // hide cursor when not inputting
    }
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
