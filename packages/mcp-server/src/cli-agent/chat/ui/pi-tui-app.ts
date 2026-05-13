import cfonts from "cfonts";
import {
  Container,
  CURSOR_MARKER,
  Input,
  Key,
  matchesKey,
  ProcessTerminal,
  TUI,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import type { ChatTerminal } from "./chat-terminal.js";
import type { Message, UIState } from "./store.js";
import {
  BOLD,
  RESET,
  fg,
  formatElapsed,
  formatTime,
  formatTokenCount,
  gradientStr,
  truncate,
} from "./ink-utils.js";
import { getModeDisplay } from "../commands/route-policy.js";

const C_CYAN = `${BOLD}${fg(0, 229, 255)}`;
const C_GRAY = fg(107, 114, 128);
const C_WHITE = fg(229, 231, 235);
const C_GREEN = fg(34, 197, 94);
const C_YELLOW = fg(250, 204, 21);
const C_RED = fg(248, 113, 113);

const COMMANDS = ["/help", "/model", "/models", "/mode", "/clear", "/retry", "/debug"] as const;
const SPINNER = ["|", "/", "-", "\\"] as const;
const ENABLE_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1006h";
const DISABLE_MOUSE_TRACKING = "\x1b[?1000l\x1b[?1006l";

function isActiveTaskPhase(phase: UIState["task"]["phase"]): boolean {
  return phase === "thinking" || phase === "tool" || phase === "streaming";
}

function generateBanner(): string[] {
  const result = cfonts.render("CODEMAP", {
    font: "simple3d",
    gradient: ["cyan", "magenta"],
    env: "node",
  });
  const raw = (result as { string?: string }).string ?? "";
  const lines = raw.split("\n");
  let start = 0;
  let end = lines.length - 1;
  while (start <= end && stripAnsi(lines[start] ?? "").trim() === "") start++;
  while (end >= start && stripAnsi(lines[end] ?? "").trim() === "") end--;
  return lines.slice(start, end + 1);
}

const BANNER_LINES = generateBanner();

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(CURSOR_MARKER, "");
}

function padToWidth(line: string, width: number): string {
  const pad = Math.max(0, width - visibleWidth(line));
  return line + " ".repeat(pad);
}

function truncateVisible(line: string, width: number): string {
  if (visibleWidth(line) <= width) return line;
  let out = "";
  for (const ch of line) {
    if (visibleWidth(out + ch) > Math.max(0, width - 1)) break;
    out += ch;
  }
  return out + "…";
}

function fitLine(line: string, width: number): string {
  return padToWidth(truncateVisible(line, width), width);
}

function parseMouseWheel(data: string): -1 | 1 | null {
  const sgr = data.match(/^\x1b\[<(\d+);\d+;\d+M$/);
  if (!sgr) return null;
  const code = Number(sgr[1]);
  if (!Number.isFinite(code) || (code & 64) === 0) return null;
  return (code & 1) === 0 ? -1 : 1;
}

function isSgrMouseEvent(data: string): boolean {
  return /^\x1b\[<\d+;\d+;\d+[mM]$/.test(data);
}

function pageScrollStep(state: UIState): number {
  return Math.max(4, Math.floor((process.stdout.rows || state.viewport.height || 24) * 0.45));
}

function wheelScrollStep(): number {
  return 3;
}

function messageContentLineCount(state: UIState, width: number): number {
  return headerLines(state).length + messageLines(state.messages, width - 2).length;
}

function wrapPlain(text: string, width: number): string[] {
  const max = Math.max(1, width);
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let remaining = paragraph;
    if (remaining.length === 0) {
      out.push("");
      continue;
    }
    while (visibleWidth(remaining) > max) {
      let take = max;
      while (take > 10 && remaining[take] !== " ") take--;
      if (take <= 10) take = max;
      out.push(remaining.slice(0, take).trimEnd());
      remaining = remaining.slice(take).trimStart();
    }
    out.push(remaining);
  }
  return out;
}

function headerLines(state: UIState): string[] {
  const modeInfo = getModeDisplay(state.config.mode);
  const workspace = state.workspace?.repoName ?? state.config.profile;
  return [
    "",
    ...BANNER_LINES,
    gradientStr(
      "  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM",
      { r: 34, g: 211, b: 238 },
      { r: 168, g: 85, b: 247 },
      false,
    ),
    "",
    [
      `${C_CYAN}o${RESET} ${C_WHITE}v0.1.0${RESET}`,
      `${C_CYAN}@${RESET} ${C_WHITE}${truncate(workspace, 20)}${RESET}`,
      `${C_CYAN}*${RESET} ${C_WHITE}${truncate(state.config.model, 24)}${RESET}`,
      `${C_CYAN}~${RESET} ${C_GREEN}${modeInfo.label}${RESET}`,
      `${C_CYAN}#${RESET} ${C_CYAN}Connected${RESET}`,
    ].join(`  ${C_GRAY}|${RESET}  `).padStart(2),
    `  ${C_CYAN}${BOLD}> Quick Start:${RESET} ${C_GRAY}/help for commands  .  @ for files  .  Tab for suggestions  .  Ctrl+C cancel${RESET}`,
    "",
  ];
}

function messageLines(messages: Message[], width: number): string[] {
  if (messages.length === 0) {
    return [
      `${C_CYAN}${BOLD}Welcome to CodeMap Agent${RESET}`,
      `${C_GRAY}Ask a question, mention files with @, or type /help.${RESET}`,
      "",
    ];
  }

  const out: string[] = [];
  const bodyWidth = Math.max(20, width - 16);
  for (const msg of messages) {
    const time = `${C_GRAY}${formatTime(msg.timestamp)}${RESET}`;
    if (msg.role === "user") {
      const lines = wrapPlain(msg.content, bodyWidth);
      out.push(`${time} ${C_GREEN}>${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(11)}${line}`);
    } else if (msg.role === "assistant") {
      const lines = wrapPlain(msg.content, bodyWidth);
      out.push(`${time} ${C_CYAN}assistant:${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(22)}${line}`);
    } else if (msg.role === "tool") {
      const label = msg.toolName ? `tool:${msg.toolName}` : "tool";
      const lines = wrapPlain(msg.content, bodyWidth);
      out.push(`${time} ${C_YELLOW}${label}:${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(18)}${line}`);
    } else if (msg.role === "system") {
      const lines = wrapPlain(msg.content, bodyWidth);
      out.push(`${time} ${C_GRAY}system:${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(18)}${line}`);
    } else {
      out.push(...wrapPlain(msg.content, width));
    }
    out.push("");
  }
  return out;
}

class BorderedInput implements Component {
  constructor(private readonly input: Input) {}

  invalidate(): void {
    this.input.invalidate();
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const top = `+${"-".repeat(innerWidth)}+`;
    const inputLine = this.input.render(innerWidth)[0] ?? "";
    const middle = `|${fitLine(inputLine, innerWidth)}|`;
    const bottom = `+${"-".repeat(innerWidth)}+`;
    return [top, middle, bottom];
  }
}

class ChatScreen implements Component {
  private frame = 0;

  constructor(
    private readonly chatTerminal: ChatTerminal,
    readonly input: Input,
  ) {}

  invalidate(): void {
    this.input.invalidate();
  }

  render(width: number): string[] {
    const state = this.chatTerminal.store.getState();
    const height = process.stdout.rows || state.viewport.height || 24;
    const lines: string[] = [];
    const bottom = this.bottomLines(state, width);
    const contentHeight = Math.max(1, height - bottom.length);
    const content = [...headerLines(state), ...messageLines(state.messages, width - 2)];

    if (state.screen === "help") {
      content.push(...this.helpLines());
    }
    if (state.subprocess.active) {
      content.push(...this.subprocessLines(state));
    }

    const maxOffset = Math.max(0, content.length - contentHeight);
    const offset = Math.min(state.messageScroll.offset, maxOffset);
    const start = Math.max(0, content.length - contentHeight - offset);
    for (const line of content.slice(start, start + contentHeight)) lines.push(fitLine(line, width));
    while (lines.length < contentHeight) lines.push(" ".repeat(width));

    lines.push(...bottom);
    return lines.map((line) => fitLine(line, width));
  }

  private bottomLines(state: UIState, width: number): string[] {
    const out: string[] = [];
    if (state.confirm.active) out.push(...this.confirmLines(state, width));
    if (state.task.phase !== "idle") out.push(this.taskLine(state, width));
    out.push(this.helpLine(width));
    out.push(...new BorderedInput(this.input).render(width));
    out.push(this.statusLine(state, width));
    return out;
  }

  private taskLine(state: UIState, width: number): string {
    const active = isActiveTaskPhase(state.task.phase);
    if (active) this.frame = (this.frame + 1) % SPINNER.length;

    const endTime = active ? Date.now() : state.task.endTime ?? Date.now();
    const elapsed = state.task.startTime ? formatElapsed(Math.max(0, endTime - state.task.startTime)) : "0s";
    const turnTokens = state.task.usage?.totalTokens ?? 0;
    const sessionTokens = state.sessionUsage.totalTokens;
    const usage = turnTokens > 0 || sessionTokens > 0
      ? ` · turn ${formatTokenCount(turnTokens)} · session ${formatTokenCount(sessionTokens)} tok`
      : "";
    const tool = state.task.toolName ? ` · ${state.task.toolName}` : "";
    const marker = state.task.phase === "done" ? `${C_GREEN}✓${RESET}` : `${C_CYAN}${SPINNER[this.frame]}${RESET}`;
    return fitLine(` ${marker} ${state.task.phase}${tool} · ${elapsed}${usage}`, width);
  }

  private helpLine(width: number): string {
    return fitLine(
      `  ${C_CYAN}[Tab]${RESET} ${C_GRAY}Complete${RESET}  ${C_CYAN}[↑↓]${RESET} ${C_GRAY}History${RESET}  ${C_CYAN}[@]${RESET} ${C_GRAY}Files${RESET}  ${C_CYAN}[Ctrl+C]${RESET} ${C_GRAY}Cancel${RESET}  ${C_CYAN}[Esc]${RESET} ${C_GRAY}Menu${RESET}  ${C_CYAN}[/]${RESET} ${C_GRAY}Commands${RESET}  ${C_CYAN}[?]${RESET} ${C_GRAY}Help${RESET}`,
      width,
    );
  }

  private statusLine(state: UIState, width: number): string {
    const workspace = state.workspace?.repoName ?? state.config.profile;
    const branch = state.workspace?.branch ? ` / ${state.workspace.branch}` : "";
    return fitLine(
      `${C_WHITE}${workspace}${RESET}${C_GRAY}${branch} · model: ${RESET}${C_WHITE}${state.config.model}${RESET}${C_GRAY} · mode: ${RESET}${C_GREEN}${state.config.mode}${RESET}${C_GRAY} · MCP: ${RESET}${C_CYAN}Connected${RESET}`,
      width,
    );
  }

  private confirmLines(state: UIState, width: number): string[] {
    const preview = state.confirm.preview?.split("\n").slice(0, 8) ?? [];
    return [
      fitLine(`${C_YELLOW}Confirm edit:${RESET} ${state.confirm.toolName}`, width),
      fitLine(`${C_GRAY}y = yes  n = no  a = accept all${RESET}`, width),
      ...preview.map((line) => {
        const color = line.startsWith("+") ? C_GREEN : line.startsWith("-") ? C_RED : C_GRAY;
        return fitLine(`${color}${line}${RESET}`, width);
      }),
    ];
  }

  private subprocessLines(state: UIState): string[] {
    return [
      "",
      `${C_YELLOW}Running:${RESET} ${state.subprocess.command}`,
      ...state.subprocess.logLines.slice(-8).map((line) => `${C_GRAY}${line}${RESET}`),
      "",
    ];
  }

  private helpLines(): string[] {
    return [
      `${C_CYAN}${BOLD}Commands${RESET}`,
      "  /help       Show help",
      "  /model      Switch model",
      "  /mode       Switch gateway mode",
      "  /clear      Clear conversation",
      "  /retry      Retry last message",
      "",
    ];
  }
}

function bottomLineCount(state: UIState): number {
  let count = 0;
  if (state.confirm.active) count += 2 + (state.confirm.preview?.split("\n").slice(0, 8).length ?? 0);
  if (state.task.phase !== "idle") count += 1;
  count += 1; // help line
  count += 3; // bordered input
  count += 1; // status line
  return count;
}

function maxMessageOffset(state: UIState): number {
  const width = process.stdout.columns || state.viewport.width || 80;
  const height = process.stdout.rows || state.viewport.height || 24;
  const contentHeight = Math.max(1, height - bottomLineCount(state));
  return Math.max(0, messageContentLineCount(state, width) - contentHeight);
}

function clampMessageOffset(state: UIState, offset: number): number {
  return Math.max(0, Math.min(offset, maxMessageOffset(state)));
}

function setInputValue(input: Input, value: string): void {
  input.setValue(value);
  (input as unknown as { cursor: number }).cursor = value.length;
}

function completeCommand(input: Input): boolean {
  const value = input.getValue();
  if (!value.startsWith("/")) return false;
  const match = COMMANDS.find((cmd) => cmd.startsWith(value));
  if (!match || match === value) return false;
  setInputValue(input, match + " ");
  return true;
}

export async function startPiTuiApp(chatTerminal: ChatTerminal): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal, true);
  const root = new Container();
  const input = new Input();
  const screen = new ChatScreen(chatTerminal, input);
  let historyIndex = -1;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    terminal.write(DISABLE_MOUSE_TRACKING);
    tui.stop();
  };

  input.onSubmit = (value) => {
    const trimmed = value.trim();
    if (!trimmed || chatTerminal.store.getState().input.busy) return;
    chatTerminal.store.dispatch((prev) => ({
      input: { ...prev.input, history: [...prev.input.history, trimmed] },
    }));
    setInputValue(input, "");
    historyIndex = -1;
    void chatTerminal.handleSubmit(trimmed);
  };

  input.onEscape = () => {
    if (chatTerminal.store.getState().screen === "help") {
      chatTerminal.store.dispatch({ screen: "main" });
    }
  };

  root.addChild(screen);
  tui.addChild(root);
  tui.setFocus(input);

  const unsubscribe = chatTerminal.bus.on("screen:refresh", () => {
    const state = chatTerminal.store.getState();
    tui.requestRender();
    terminal.setProgress(state.task.phase !== "idle" && state.task.phase !== "done");
  });

  const tick = setInterval(() => {
    if (isActiveTaskPhase(chatTerminal.store.getState().task.phase)) tui.requestRender();
  }, 250);

  tui.addInputListener((data) => {
    const state = chatTerminal.store.getState();
    if (matchesKey(data, Key.ctrl("c"))) {
      clearInterval(tick);
      stop();
      process.exit(0);
    }

    if (state.confirm.active) {
      if (data === "y") chatTerminal.resolveConfirm(true);
      else if (data === "a") chatTerminal.resolveConfirmAll();
      else if (data === "n" || matchesKey(data, Key.escape)) chatTerminal.resolveConfirm(false);
      return { consume: true };
    }

    const wheelDirection = parseMouseWheel(data);
    if (wheelDirection) {
      const step = wheelScrollStep();
      const offset = wheelDirection < 0
        ? clampMessageOffset(state, state.messageScroll.offset + step)
        : clampMessageOffset(state, state.messageScroll.offset - step);
      chatTerminal.store.dispatch({ messageScroll: { offset, autoScroll: offset === 0 } });
      return { consume: true };
    }
    if (isSgrMouseEvent(data)) return { consume: true };

    if (matchesKey(data, Key.pageUp)) {
      const offset = clampMessageOffset(state, state.messageScroll.offset + pageScrollStep(state));
      chatTerminal.store.dispatch({ messageScroll: { offset, autoScroll: false } });
      return { consume: true };
    }
    if (matchesKey(data, Key.pageDown)) {
      const offset = clampMessageOffset(state, state.messageScroll.offset - pageScrollStep(state));
      chatTerminal.store.dispatch({ messageScroll: { offset, autoScroll: offset === 0 } });
      return { consume: true };
    }

    if (matchesKey(data, Key.tab)) {
      return completeCommand(input) ? { consume: true } : { consume: true };
    }

    if (matchesKey(data, Key.up) && input.getValue().length === 0 && state.input.history.length > 0) {
      historyIndex = Math.min(historyIndex + 1, state.input.history.length - 1);
      setInputValue(input, state.input.history[state.input.history.length - 1 - historyIndex] ?? "");
      return { consume: true };
    }
    if (matchesKey(data, Key.down) && historyIndex >= 0) {
      historyIndex--;
      setInputValue(input, historyIndex >= 0 ? state.input.history[state.input.history.length - 1 - historyIndex] ?? "" : "");
      return { consume: true };
    }

    return undefined;
  });

  process.once("exit", () => {
    clearInterval(tick);
    stop();
  });

  tui.start();
  terminal.write(ENABLE_MOUSE_TRACKING);
  tui.requestRender(true);

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (stopped) {
        clearInterval(interval);
        clearInterval(tick);
        resolve();
      }
    }, 50);
  });
}
