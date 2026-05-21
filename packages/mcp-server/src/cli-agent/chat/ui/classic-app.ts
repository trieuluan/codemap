/**
 * Classic (non-TUI) renderer for CodeMap Chat.
 *
 * Instead of an alternate-screen full-screen TUI, this renderer prints messages
 * directly to the normal terminal buffer so the terminal's native scrollback and
 * text-selection/copy work without any special mode.
 *
 * Input is handled via Node's `readline` interface (history, arrow keys, tab
 * completion).  Spinner animation uses \r to overwrite the current line.
 */
import readline from "node:readline";
import type { ChatTerminal } from "./chat-terminal.js";
import { renderMarkdownish, stripAnsi, wrapPlain } from "./pi-tui/text.js";
import { initShiki } from "./pi-tui/shiki-highlight.js";
import { isActiveTaskPhase } from "./pi-tui/panel-builder.js";
import {
  RESET,
  SPINNER,
  C_ACTION,
  C_ERROR,
  C_GRAY,
  C_MUTED,
  C_SUCCESS,
  C_WARNING,
  C_WHITE,
} from "./pi-tui/theme.js";
import { normalizeHtml } from "../html-utils.js";
import type { Message } from "./store.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function W(): number { return process.stdout.columns ?? 80; }

function safeRender(content: string, width: number): string[] {
  const cleaned = normalizeHtml(content);
  try {
    return renderMarkdownish(cleaned, width);
  } catch {
    return cleaned.split("\n").flatMap((l) => wrapPlain(l, width));
  }
}

function fmtTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function displayName(toolName: string): string {
  const sep = toolName.indexOf("__");
  return sep === -1 ? toolName : toolName.slice(sep + 2);
}

// ─── Message printers ─────────────────────────────────────────────────────────

function printUserMsg(msg: Message): void {
  const w = W();
  const time = fmtTime(msg.timestamp);
  const prefW = time.length + 3; // "HH:MM:SS > "
  const bodyW = Math.max(20, w - prefW);
  const lines = safeRender(msg.content, bodyW);
  process.stdout.write("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      process.stdout.write(`${C_MUTED}${time}${RESET} ${C_ACTION}>${RESET} ${lines[i]}\n`);
    } else {
      process.stdout.write(`${" ".repeat(prefW)}${lines[i]}\n`);
    }
  }
}

function printAssistantMsg(msg: Message): void {
  if (!msg.content?.trim()) return;
  const w = W();
  const time = fmtTime(msg.timestamp);
  const prefW = time.length + 1;
  const bodyW = Math.max(20, w - prefW);
  const lines = safeRender(stripAnsi(msg.content), bodyW);
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      process.stdout.write(`${C_MUTED}${time}${RESET} ${lines[i]}\n`);
    } else {
      process.stdout.write(`${" ".repeat(prefW)}${lines[i]}\n`);
    }
  }
  process.stdout.write("\n");
}

function printToolSummaryMsg(msg: Message): void {
  // Print the completed ⎿ tool lines from the summary (skip header + pending lines).
  const lines = msg.content.split("\n");
  for (const line of lines) {
    const clean = stripAnsi(line).trim();
    if (!clean.startsWith("⎿ ")) continue;
    const isOk = clean.endsWith("✓");
    const isErr = clean.endsWith("✗");
    const name = clean.slice(2).replace(/ [✓✗]$/, "").trim();
    const col = isOk ? C_GRAY : isErr ? C_ERROR : C_MUTED;
    const marker = isOk
      ? ` ${C_SUCCESS}✓${RESET}`
      : isErr
        ? ` ${C_ERROR}✗${RESET}`
        : "";
    process.stdout.write(`  ${C_MUTED}⎿${RESET} ${col}${name}${RESET}${marker}\n`);
  }
}

function printSystemMsg(msg: Message): void {
  process.stdout.write(`${C_MUTED}${msg.content}${RESET}\n`);
}

function printMsg(msg: Message): void {
  switch (msg.role) {
    case "user":      printUserMsg(msg);       break;
    case "assistant": printAssistantMsg(msg);  break;
    case "tool":
      if (msg.content.includes("(ctrl+o to expand)")) printToolSummaryMsg(msg);
      break;
    case "system":    printSystemMsg(msg);     break;
    default: break;
  }
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frame = 0;
  private name = "";

  start(toolName: string): void {
    this.name = displayName(toolName);
    this.frame = 0;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      const spin = SPINNER[this.frame % SPINNER.length] ?? "⠋";
      this.frame++;
      process.stdout.write(
        `\r\x1b[K  ${C_MUTED}⎿${RESET} ${C_GRAY}${this.name}${RESET} ${C_WHITE}${spin}${RESET}`,
      );
    }, 80);
  }

  finish(toolName: string, success: boolean): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const name = displayName(toolName);
    const marker = success ? `${C_SUCCESS}✓${RESET}` : `${C_ERROR}✗${RESET}`;
    process.stdout.write(`\r\x1b[K  ${C_MUTED}⎿${RESET} ${C_GRAY}${name}${RESET} ${marker}\n`);
  }

  clear(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    process.stdout.write("\r\x1b[K");
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function startClassicApp(chatTerminal: ChatTerminal): Promise<void> {
  await initShiki().catch(() => {});

  const spinner = new Spinner();

  // ── State ──────────────────────────────────────────────────────────────────
  let printedUpTo = 0;          // messages[0..printedUpTo) have been printed
  let streamingIdx = -1;        // index of the message currently streaming (-1 = none)
  let lastStreamLen = 0;        // chars of streaming content already written to stdout
  let wasStreaming = false;
  let prevToolPhase = false;    // was task.phase === "tool" last tick?
  let prevToolName = "";
  let confirmActive = false;

  // ── Session resume ─────────────────────────────────────────────────────────
  const initState = chatTerminal.store.getState();
  if (initState.messages.length > 0) {
    process.stdout.write(
      `${C_MUTED}Session resumed · ${initState.messages.length} messages · use ↑/↓ for history${RESET}\n\n`,
    );
    printedUpTo = initState.messages.length;
  }

  // ── Readline ───────────────────────────────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 500,
    prompt: `${C_ACTION}> ${RESET}`,
    completer: (line: string, cb: (e: null, r: [string[], string]) => void) => {
      const cmds = [
        "/help", "/new", "/compact", "/refresh", "/reimport",
        "/commit", "/pr", "/settings", "/tools",
      ];
      const hits = line.startsWith("/") ? cmds.filter((c) => c.startsWith(line)) : [];
      cb(null, [hits, line]);
    },
  });

  // ── Input busy guard ───────────────────────────────────────────────────────
  function setInputBusy(busy: boolean): void {
    if (busy) {
      rl.pause();
    } else {
      rl.resume();
      rl.prompt(true);
    }
  }

  // ── Confirm dialog (inline) ────────────────────────────────────────────────
  function handleConfirmState(state: ReturnType<typeof chatTerminal.store.getState>): void {
    if (!state.confirm.active || confirmActive) return;
    confirmActive = true;
    spinner.clear();

    const preview = state.confirm.preview ?? "";
    const toolName = state.confirm.toolName;
    if (preview) {
      process.stdout.write("\n" + preview + "\n");
    }
    process.stdout.write(
      `\n${C_WARNING}Confirm edit:${RESET} ${C_GRAY}${toolName}${RESET}\n` +
      `  ${C_ACTION}y${RESET} Apply  ${C_ERROR}n${RESET} Skip  ${C_ACTION}a${RESET} Accept all  ${C_ERROR}Esc${RESET} Reject\n`,
    );

    rl.resume();
    rl.question(`${C_MUTED}Choice [y/n/a]:${RESET} `, (answer) => {
      confirmActive = false;
      const a = answer.trim().toLowerCase();
      if (a === "a") {
        chatTerminal.resolveConfirmAll();
      } else if (a === "y" || a === "yes") {
        chatTerminal.resolveConfirm(true);
      } else {
        chatTerminal.resolveConfirm(false);
      }
    });
  }

  // ── Store subscription ─────────────────────────────────────────────────────
  chatTerminal.bus.on("screen:refresh", () => {
    const state = chatTerminal.store.getState();
    const msgs = state.messages as Message[];
    const curStreamIdx = state.streaming.active ? state.streaming.entryIndex : -1;
    const isToolPhase = state.task.phase === "tool";

    // Detect tool start / end
    if (isToolPhase && !prevToolPhase) {
      // Tool just started
      const toolName = state.task.toolName ?? "tool";
      prevToolName = toolName;
      spinner.start(toolName);
    } else if (!isToolPhase && prevToolPhase && prevToolName) {
      // Tool just finished — check success from last tool message
      const lastToolMsg = [...msgs].reverse().find(
        (m) => m.role === "tool" && m.content.includes("(ctrl+o to expand)"),
      );
      const lastLine = lastToolMsg?.content.split("\n").findLast((l) =>
        l.startsWith("⎿ " + displayName(prevToolName)) ||
        l.startsWith(`⎿ ${prevToolName}`),
      ) ?? "";
      const success = lastLine.endsWith("✓");
      spinner.finish(prevToolName, success);
      prevToolName = "";
    }
    prevToolPhase = isToolPhase;

    // Print completed non-streaming messages
    for (let i = printedUpTo; i < msgs.length; i++) {
      const msg = msgs[i]!;
      // Skip: currently streaming, or tool summaries (handled separately via spinner)
      if (i === curStreamIdx) continue;
      if (msg.role === "tool" && msg.content.includes("(ctrl+o to expand)")) {
        printedUpTo = i + 1;
        continue; // tool lines printed via spinner.finish(), skip here
      }
      printMsg(msg);
      printedUpTo = i + 1;
    }

    // Handle streaming content
    if (state.streaming.active) {
      const streamMsg = msgs[curStreamIdx];
      if (streamMsg) {
        if (curStreamIdx !== streamingIdx) {
          // New streaming message started — ensure blank line before response
          streamingIdx = curStreamIdx;
          lastStreamLen = 0;
          const time = fmtTime(streamMsg.timestamp);
          process.stdout.write(`\n${C_MUTED}${time}${RESET} `);
        }
        const newContent = (streamMsg.content ?? "").slice(lastStreamLen);
        if (newContent) {
          process.stdout.write(newContent);
          lastStreamLen = (streamMsg.content ?? "").length;
        }
        wasStreaming = true;
      }
    } else if (wasStreaming) {
      // Streaming just ended — finalise
      process.stdout.write("\n\n");
      if (streamingIdx >= 0) {
        printedUpTo = Math.max(printedUpTo, streamingIdx + 1);
      }
      streamingIdx = -1;
      lastStreamLen = 0;
      wasStreaming = false;
    }

    // Confirm dialog
    handleConfirmState(state);

    // Re-show prompt when task ends
    if (!isActiveTaskPhase(state.task.phase) && !state.streaming.active && !confirmActive) {
      setInputBusy(false);
    }
  });

  // ── Line handler ───────────────────────────────────────────────────────────
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(true); return; }

    const state = chatTerminal.store.getState();
    if (state.input.busy) { rl.prompt(true); return; }

    setInputBusy(true);
    await chatTerminal.handleSubmitWithContent(trimmed, trimmed);
    // setInputBusy(false) is called from the store subscription when task ends
  });

  // ── Ctrl+C ─────────────────────────────────────────────────────────────────
  rl.on("SIGINT", () => {
    const state = chatTerminal.store.getState();
    if (state.input.busy) {
      const cancelledPrompt = chatTerminal.cancelTask();
      spinner.clear();
      wasStreaming = false;
      streamingIdx = -1;
      lastStreamLen = 0;
      printedUpTo = (chatTerminal.store.getState().messages as Message[]).length;
      process.stdout.write(`\n${C_MUTED}Task cancelled.${RESET}\n\n`);
      rl.resume();
      if (cancelledPrompt) rl.write(cancelledPrompt);
      rl.prompt(true);
    } else {
      process.stdout.write("\n");
      rl.close();
    }
  });

  rl.on("close", () => { process.exit(0); });

  // ── Start ──────────────────────────────────────────────────────────────────
  process.stdout.write("\n");
  rl.prompt(true);

  return new Promise<void>((resolve) => {
    rl.on("close", resolve);
  });
}
