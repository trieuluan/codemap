import type { Editor } from "@earendil-works/pi-tui";
import type { UIState } from "../store.js";
import { formatElapsed, formatTokenCount, truncate } from "../ink-utils.js";
import { getCommandList } from "../../commands/index.js";
import { renderEditor } from "./editor-renderer.js";
import {
  BOLD,
  C_ACTION,
  C_AI,
  C_GRAY,
  C_MUTED,
  C_SUCCESS,
  C_WARNING,
  C_ERROR,
  C_WHITE,
  RESET,
  SPINNER,
} from "./theme.js";
import { fitLine, padToWidth, stripAnsi, truncateVisible } from "./text.js";

function commitsDiffer(localCommit?: string, cloudCommit?: string): boolean {
  if (!localCommit || !cloudCommit) return false;

  const local = localCommit.trim();
  const cloud = cloudCommit.trim();
  if (!local || !cloud) return false;

  return !(local.startsWith(cloud) || cloud.startsWith(local));
}

export function isActiveTaskPhase(phase: UIState["task"]["phase"]): boolean {
  return (
    phase === "thinking" ||
    phase === "tool" ||
    phase === "streaming" ||
    phase === "classifying" ||
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
  statusMessage?: string;
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
  statusMessage = "",
): string {
  const workspace = state.workspace?.repoName ?? state.config.profile;
  const branch = state.workspace?.branch ? `/${state.workspace.branch}` : "";

  const right = statusMessage
    ? `${C_WARNING}${statusMessage}${RESET}`
    : copyMode
      ? `${C_WARNING}✎ COPY MODE${RESET}${C_MUTED} · Ctrl+T to scroll${RESET}`
      : state.planMode
        ? `${C_AI}◈ PLAN MODE${RESET}${C_MUTED} · /plan to exit${RESET}`
        : debugMode
          ? `${C_ERROR}⏺ DEBUG${RESET}${C_MUTED} · /debug to stop${RESET}`
          : `${C_ACTION}MCP connected${RESET}`;

  const reimportHint = commitsDiffer(
    state.workspace?.localCommit,
    state.workspace?.cloudCommit,
  )
    ? `${C_WARNING}⚠ reimport recommended${RESET}`
    : "";

  const left =
    `${C_WHITE}${workspace}${RESET}${C_MUTED}${branch} · ${RESET}` +
    `${C_WHITE}${truncate(state.config.model, 28)}${RESET}${C_MUTED} · ${RESET}` +
    right;

  if (!reimportHint) return fitLine(left, w);

  const hintWidth = stripAnsi(reimportHint).length;
  const gap = "  ";
  const maxLeftWidth = Math.max(0, w - hintWidth - gap.length);
  const clippedLeft = truncateVisible(left, maxLeftWidth);
  const paddingWidth = Math.max(
    0,
    w - stripAnsi(clippedLeft).length - hintWidth,
  );
  return fitLine(clippedLeft + " ".repeat(paddingWidth) + reimportHint, w);
}

export function buildPanel(
  state: UIState,
  w: number,
  ctx: PanelContext,
): PanelResult {
  const { editor, frame, shellMode, debugMode, copyMode, statusMessage } = ctx;

  let { confirmSelection, confirmSignature } = ctx;

  const out: string[] = [];
  let cursorRow = -1;
  let cursorCol = 0;

  // /help overlay — generated dynamically so it's always in sync with registered commands.
  if (state.screen === "help") {
    const cmds = getCommandList();
    const half = Math.ceil(cmds.length / 2);
    // Each column gets equal space; 4 chars reserved for margins ("  " on each side).
    const colW = Math.max(24, Math.floor((w - 4) / 2));
    // Longest command name is "conventions" (11) + "/" = 12 → pad to 13.
    const NAME_W = 13;
    const descW = Math.max(4, colW - NAME_W - 1);

    // Render one column cell padded to exactly colW visible chars.
    const fmtCol = (c: (typeof cmds)[0] | undefined): string => {
      if (!c) return " ".repeat(colW);
      const namePart = `${C_ACTION}/${c.name.padEnd(NAME_W - 1)}${RESET} `;
      const descPart = `${C_GRAY}${truncate(c.description, descW)}${RESET}`;
      return padToWidth(namePart + descPart, colW);
    };

    out.push(fitLine(`${C_ACTION}${BOLD} Commands${RESET}`, w));

    for (let i = 0; i < half; i++) {
      out.push(fitLine(`  ${fmtCol(cmds[i])}  ${fmtCol(cmds[i + half])}`, w));
    }

    out.push(
      fitLine("", w),
      fitLine(
        `  ${C_ACTION}@${RESET} ${C_GRAY}mention file${RESET}  ` +
          `${C_ACTION}!<cmd>${RESET} ${C_GRAY}shell${RESET}  ` +
          `${C_ACTION}Ctrl+T${RESET} ${C_GRAY}copy mode${RESET}  ` +
          `${C_ACTION}PgUp/Dn${RESET} ${C_GRAY}scroll${RESET}`,
        w,
      ),
      fitLine(`  ${C_ACTION}Esc${RESET} ${C_GRAY}to close${RESET}`, w),
      fitLine("", w),
    );
  }

  // Subprocess log.
  if (state.subprocess.active) {
    out.push(
      fitLine(`${C_WARNING}Running:${RESET} ${state.subprocess.command}`, w),
    );
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
    const promptTok = state.task.usage?.promptTokens ?? 0;
    const completionTok = state.task.usage?.completionTokens ?? 0;
    const sessTok = state.sessionTokens;
    const usage =
      promptTok > 0 || sessTok > 0
        ? ` · ${[
            promptTok > 0 ? `↑${formatTokenCount(promptTok)}` : "",
            completionTok > 0 ? `↓${formatTokenCount(completionTok)}` : "",
            sessTok > 0 ? `∑${formatTokenCount(sessTok)}` : "",
          ]
            .filter(Boolean)
            .join(" ")} tok`
        : "";
    const tool = state.task.toolName ? ` · ${state.task.toolName}` : "";
    const displayModel = state.task.model ?? "";
    const model = displayModel
      ? ` ${C_GRAY}${truncate(displayModel, 28)}${RESET}`
      : "";
    const phaseLabel: Record<string, string> = {
      classifying: "classifying...",
      planning: "planning...",
      executing: "executing...",
      reviewing: "reviewing...",
      thinking: "thinking",
      streaming: "streaming",
      tool: "tool",
      done: "done",
    };
    const label = phaseLabel[state.task.phase] ?? state.task.phase;
    const phaseColor =
      state.task.phase === "done"
        ? C_SUCCESS
        : state.task.phase === "classifying" ||
            state.task.phase === "planning" ||
            state.task.phase === "reviewing" ||
            state.task.phase === "thinking"
          ? C_AI
          : C_ACTION;
    const marker =
      state.task.phase === "done"
        ? `${C_SUCCESS}✓${RESET}`
        : `${phaseColor}${SPINNER[frame]}${RESET}`;
    out.push(
      fitLine(
        ` ${marker} ${phaseColor}${label}${RESET}${model}${tool} ${C_MUTED}· ${elapsed}${usage}${RESET}`,
        w,
      ),
    );
  }

  // Background synthesis indicator.
  if (state.synthRunning) {
    out.push(
      fitLine(
        ` ${C_AI}${SPINNER[frame]}${RESET} ${C_GRAY}synthesizing context ${C_MUTED}(conventions · rules · skills)…${RESET}`,
        w,
      ),
    );
  }

  // Hint bar — shows plan review options when waiting for user approval.
  if (state.planReview?.active) {
    const sel = state.planReview.selection ?? 0;
    const PLAN_OPTIONS = [
      {
        label: "implement",
        desc: "Proceed with implementation (planner → coder → reviewer)",
      },
      { label: "no", desc: "Cancel — don't implement this plan" },
    ];
    out.push(
      fitLine(
        `  ${C_AI}◈ Plan ready${RESET}  ` +
          `${C_ACTION}↑↓${RESET}${C_GRAY}/select · ${RESET}` +
          `${C_ACTION}Enter${RESET}${C_GRAY}/confirm · ${RESET}` +
          `${C_GRAY}or type feedback + ${RESET}${C_ACTION}Enter${RESET}${C_GRAY} to revise${RESET}`,
        w,
      ),
    );
    for (const [idx, opt] of PLAN_OPTIONS.entries()) {
      const selected = idx === sel;
      const prefix = selected ? `${C_ACTION}>${RESET}` : " ";
      const isNo = opt.label === "no";
      const labelColor = isNo ? C_ERROR : C_WHITE;
      const label = selected
        ? `${labelColor}${BOLD}${opt.label}${RESET}`
        : `${labelColor}${opt.label}${RESET}`;
      out.push(
        fitLine(`  ${prefix} ${label}  ${C_GRAY}${opt.desc}${RESET}`, w),
      );
    }
  } else {
    out.push(
      fitLine(
        `  ${C_ACTION}Tab${RESET} ${C_GRAY}complete${RESET}` +
          `  ${C_ACTION}↑↓${RESET} ${C_GRAY}history${RESET}` +
          `  ${C_ACTION}@${RESET} ${C_GRAY}files${RESET}` +
          `  ${C_ACTION}!${RESET} ${C_GRAY}shell${RESET}` +
          `  ${C_ACTION}/help${RESET} ${C_GRAY}commands${RESET}` +
          `  ${C_ACTION}Ctrl+T${RESET} ${C_GRAY}copy${RESET}` +
          `  ${C_ACTION}Ctrl+C${RESET} ${C_GRAY}exit${RESET}`,
        w,
      ),
    );
  }

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
      fitLine(`${C_WARNING}Confirm edit:${RESET} ${state.confirm.toolName}`, w),
      fitLine(
        `${C_MUTED}↑↓ select  Enter confirm  y/n/a shortcuts  Esc reject${RESET}`,
        w,
      ),
    );
    const options = [
      { label: "Apply", desc: "Apply this change" },
      { label: "Reject", desc: "Skip this change" },
      { label: "Accept all", desc: "Apply this and future edits" },
    ];
    for (const [idx, option] of options.entries()) {
      const selected = idx === confirmSelection;
      const isReject = option.label === "Reject";
      const prefix = selected ? `${C_ACTION}>${RESET}` : " ";
      const label = selected
        ? `${isReject ? C_ERROR : C_WHITE}${BOLD}${option.label}${RESET}`
        : `${isReject ? C_ERROR : C_WHITE}${option.label}${RESET}`;
      out.push(
        fitLine(`  ${prefix} ${label}  ${C_GRAY}${option.desc}${RESET}`, w),
      );
    }
  }

  // Status bar.
  out.push(buildStatusBar(state, w, copyMode, debugMode, statusMessage));

  return {
    lines: out,
    cursorRow,
    cursorCol,
    editorStart,
    confirmSignature,
    confirmSelection,
  };
}
