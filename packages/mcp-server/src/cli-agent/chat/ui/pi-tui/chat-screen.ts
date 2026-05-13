import { type Component, type Editor } from "@earendil-works/pi-tui";
import type { ChatTerminal } from "../chat-terminal.js";
import type { UIState } from "../store.js";
import { formatElapsed, formatTokenCount, truncate } from "../ink-utils.js";
import { headerLines, messageLines, wrapPlain } from "./message-renderer.js";
import { BOLD, RESET, C_CYAN, C_GRAY, C_GREEN, C_RED, C_WHITE, C_YELLOW, SPINNER } from "./theme.js";
import { fitLine } from "./text.js";

function isActiveTaskPhase(phase: UIState["task"]["phase"]): boolean {
  return phase === "thinking" || phase === "tool" || phase === "streaming";
}

export class ChatScreen implements Component {
  private frame = 0;

  constructor(
    private readonly chatTerminal: ChatTerminal,
    readonly editor: Editor,
  ) {}

  invalidate(): void {
    this.editor.invalidate();
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
    out.push(...this.editor.render(width));
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
      ? ` · t ${formatTokenCount(turnTokens)} · s ${formatTokenCount(sessionTokens)} tok`
      : "";
    const tool = state.task.toolName ? ` · ${state.task.toolName}` : "";
    const marker = state.task.phase === "done" ? `${C_GREEN}✓${RESET}` : `${C_CYAN}${SPINNER[this.frame]}${RESET}`;
    return fitLine(` ${marker} ${state.task.phase}${tool} · ${elapsed}${usage}`, width);
  }

  private helpLine(width: number): string {
    return fitLine(
      `  ${C_CYAN}Tab${RESET} ${C_GRAY}complete${RESET}  ${C_CYAN}↑↓${RESET} ${C_GRAY}history${RESET}  ${C_CYAN}@${RESET} ${C_GRAY}files${RESET}  ${C_CYAN}PgUp/PgDn${RESET} ${C_GRAY}scroll${RESET}  ${C_CYAN}Ctrl+C${RESET} ${C_GRAY}exit${RESET}`,
      width,
    );
  }

  private statusLine(state: UIState, width: number): string {
    const workspace = state.workspace?.repoName ?? state.config.profile;
    const branch = state.workspace?.branch ? `/${state.workspace.branch}` : "";
    return fitLine(
      `${C_WHITE}${workspace}${RESET}${C_GRAY}${branch} · ${RESET}${C_WHITE}${truncate(state.config.model, 24)}${RESET}${C_GRAY} · ${RESET}${C_GREEN}${state.config.mode}${RESET}${C_GRAY} · ${RESET}${C_CYAN}MCP connected${RESET}`,
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
      "  /help       Show this help",
      "  /tools      List tools  \x1b[32m[local]\x1b[0m no auth  \x1b[33m[auth]\x1b[0m login  \x1b[36m[cloud]\x1b[0m project",
      "  /model      Switch model",
      "  /mode       Switch gateway mode",
      "  /clear      Clear conversation",
      "  /retry      Retry last message",
      "",
    ];
  }
}

export function bottomLineCount(state: UIState): number {
  let count = 0;
  if (state.confirm.active) count += 2 + (state.confirm.preview?.split("\n").slice(0, 8).length ?? 0);
  if (state.task.phase !== "idle") count += 1;
  count += 1; // help line
  const rows = process.stdout.rows || 24;
  count += Math.max(5, Math.floor(rows * 0.3)) + 2; // editor: content lines + top/bottom borders
  count += 1; // status line
  return count;
}

export { isActiveTaskPhase, wrapPlain };
