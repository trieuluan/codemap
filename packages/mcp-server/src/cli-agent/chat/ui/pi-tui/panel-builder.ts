import type { Editor } from "@earendil-works/pi-tui";
import type { UIState } from "../store.js";
import { formatElapsed, formatTokenCount, truncate } from "../ink-utils.js";
import { getModeDisplay } from "../../commands/route-policy.js";
import { renderEditor } from "./editor-renderer.js";
import {
  BOLD,
  C_CYAN,
  C_GRAY,
  C_GREEN,
  C_RED,
  C_WHITE,
  C_YELLOW,
  RESET,
  SPINNER,
} from "./theme.js";
import { fitLine } from "./text.js";

export function isActiveTaskPhase(phase: UIState["task"]["phase"]): boolean {
  return (
    phase === "thinking" ||
    phase === "tool" ||
    phase === "streaming" ||
    phase === "planning" ||
    phase === "executing" ||
    phase === "reviewing"
  );
}

export interface PanelContext {
  editor: Editor;
  /** Current spinner frame index — advanced by the render loop, not here. */
  frame: number;
  shellMode: boolean;
  debugMode: boolean;
  copyMode: boolean;
  confirmSelection: number;
  confirmSignature: string;
}

export interface PanelResult {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  editorStart: number;
  /** Possibly updated when a new confirm dialog appears. */
  confirmSignature: string;
  confirmSelection: number;
}

export function buildStatusBar(
  state: UIState,
  w: number,
  copyMode: boolean,
  debugMode: boolean,
): string {
  const workspace = state.workspace?.repoName ?? state.config.profile;
  const branch = state.workspace?.branch ? `/${state.workspace.branch}` : "";
  const modeInfo = getModeDisplay(state.config.mode);
  const right = copyMode
    ? `${C_YELLOW}✎ COPY MODE${RESET}${C_GRAY} · Ctrl+T to scroll${RESET}`
    : debugMode
      ? `${C_RED}⏺ DEBUG${RESET}${C_GRAY} · /debug to stop${RESET}`
      : `${C_CYAN}MCP connected${RESET}`;
  return fitLine(
    `${C_WHITE}${workspace}${RESET}${C_GRAY}${branch} · ${RESET}` +
      `${C_WHITE}${truncate(state.config.model, 24)}${RESET}${C_GRAY} · ${RESET}` +
      `${C_GREEN}${modeInfo.label}${RESET}${C_GRAY} · ${RESET}` +
      right,
    w,
  );
}

export function buildPanel(
  state: UIState,
  w: number,
  ctx: PanelContext,
): PanelResult {
  const {
    editor,
    frame,
    shellMode,
    debugMode,
    copyMode,
  } = ctx;

  let { confirmSelection, confirmSignature } = ctx;

  const out: string[] = [];
  let cursorRow = -1;
  let cursorCol = 0;

  // /help overlay.
  if (state.screen === "help") {
    out.push(
      fitLine(`${C_CYAN}${BOLD}Commands${RESET}`, w),
      fitLine("  /help       Show this help", w),
      fitLine("  /model      Switch model", w),
      fitLine("  /mode       Switch gateway mode", w),
      fitLine("  /clear      Clear conversation", w),
      fitLine("  /compact    Compact agent context", w),
      fitLine("  /retry      Retry last message", w),
      fitLine("  !<cmd>      Run shell command", w),
      fitLine(`  ${C_GRAY}Esc to close${RESET}`, w),
      fitLine("", w),
    );
  }

  // Subprocess log.
  if (state.subprocess.active) {
    out.push(fitLine(`${C_YELLOW}Running:${RESET} ${state.subprocess.command}`, w));
    for (const l of state.subprocess.logLines.slice(-4)) {
      out.push(fitLine(`${C_GRAY}${l}${RESET}`, w));
    }
  }

  // Task / progress line.
  if (state.task.phase !== "idle") {
    const active = isActiveTaskPhase(state.task.phase);
    const endTime = active ? Date.now() : (state.task.endTime ?? Date.now());
    const elapsed = state.task.startTime
      ? formatElapsed(Math.max(0, endTime - state.task.startTime))
      : "0s";
    const turnTok = state.task.usage?.totalTokens ?? 0;
    const sessTok = state.sessionUsage.totalTokens;
    const usage =
      turnTok > 0 || sessTok > 0
        ? ` · t ${formatTokenCount(turnTok)} · s ${formatTokenCount(sessTok)} tok`
        : "";
    const tool = state.task.toolName ? ` · ${state.task.toolName}` : "";
    const model = state.task.model
      ? ` ${C_GRAY}${truncate(state.task.model, 28)}${RESET}`
      : "";
    const phaseLabel: Record<string, string> = {
      planning: "planning...",
      executing: "executing...",
      reviewing: "reviewing...",
      thinking: "thinking",
      streaming: "streaming",
      tool: "tool",
      done: "done",
    };
    const label = phaseLabel[state.task.phase] ?? state.task.phase;
    const marker =
      state.task.phase === "done"
        ? `${C_GREEN}✓${RESET}`
        : `${C_CYAN}${SPINNER[frame]}${RESET}`;
    out.push(fitLine(` ${marker} ${label}${model}${tool} · ${elapsed}${usage}`, w));
  }

  // Background synthesis indicator.
  if (state.synthRunning) {
    out.push(fitLine(
      ` ${C_GRAY}${SPINNER[frame]} synthesizing context (conventions · rules · skills)…${RESET}`,
      w,
    ));
  }

  // Hint bar.
  out.push(fitLine(
    `  ${C_CYAN}Tab${RESET} ${C_GRAY}complete${RESET}` +
      `  ${C_CYAN}↑↓${RESET} ${C_GRAY}history${RESET}` +
      `  ${C_CYAN}@${RESET} ${C_GRAY}files${RESET}` +
      `  ${C_CYAN}!${RESET} ${C_GRAY}shell${RESET}` +
      `  ${C_CYAN}/help${RESET} ${C_GRAY}commands${RESET}` +
      `  ${C_CYAN}Ctrl+T${RESET} ${C_GRAY}copy${RESET}` +
      `  ${C_CYAN}Ctrl+C${RESET} ${C_GRAY}exit${RESET}`,
    w,
  ));

  // Editor + autocomplete.
  const editorStart = out.length;
  const {
    lines: editorLines,
    cursorRow: eCursorRow,
    cursorCol: eCursorCol,
  } = renderEditor(editor, w, editorStart, shellMode, debugMode);
  cursorRow = eCursorRow;
  cursorCol = eCursorCol;
  out.push(...editorLines);

  // Confirm dialog.
  if (state.confirm.active) {
    const signature = `${state.confirm.toolName}\n${state.confirm.preview ?? ""}`;
    if (signature !== confirmSignature) {
      confirmSignature = signature;
      confirmSelection = 0;
    }
    out.push(
      fitLine(`${C_YELLOW}Confirm edit:${RESET} ${state.confirm.toolName}`, w),
      fitLine(`${C_GRAY}↑↓ select  Enter confirm  y/n/a shortcuts  Esc reject${RESET}`, w),
    );
    const options = [
      { label: "Apply", desc: "Apply this change" },
      { label: "Reject", desc: "Skip this change" },
      { label: "Accept all", desc: "Apply this and future edits" },
    ];
    for (const [idx, option] of options.entries()) {
      const selected = idx === confirmSelection;
      const prefix = selected ? `${C_CYAN}>${RESET}` : " ";
      const label = selected
        ? `${C_WHITE}${BOLD}${option.label}${RESET}`
        : `${C_WHITE}${option.label}${RESET}`;
      out.push(fitLine(`  ${prefix} ${label}  ${C_GRAY}${option.desc}${RESET}`, w));
    }
  }

  // Status bar.
  out.push(buildStatusBar(state, w, copyMode, debugMode));

  return {
    lines: out,
    cursorRow,
    cursorCol,
    editorStart,
    confirmSignature,
    confirmSelection,
  };
}
