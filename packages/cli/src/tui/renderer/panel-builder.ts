import type { Editor } from "@earendil-works/pi-tui";
import type { UIState, TaskListItem, ChangedSummary, ChangedFileSummary } from "../../chat/state/store.js";
import type { PlanReviewAction } from "../../agent/runtime/types.js";
import { formatElapsed, formatTokenCount, truncate } from "./ink-utils.js";
import { getCommandList } from "../../chat/slash-commands/index.js";
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
  DIM,
  RESET,
  SPINNER,
} from "../theme.js";
import { fitLine, padToWidth, truncateVisible, visibleTextWidth } from "../text/text.js";
import { isGatewayOffline } from "./stderr-interceptor.js";
import { getResolvedModel } from "../../agent/runtime/harness/fetch-interceptor.js";

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
  statusMessage?: string;
  /** When true, the model picker autocomplete is open — hide the editor, show a hint instead. */
  modelPickerActive?: boolean;
}

export interface PanelResult {
  lines: string[];
}

export function buildStatusBar(
  state: UIState,
  w: number,
  debugMode: boolean,
  statusMessage = "",
): string {
  const workspace = state.workspace?.repoName ?? state.config.model;
  const branch = state.workspace?.branch ? `/${state.workspace.branch}` : "";

  const gatewayTag = isGatewayOffline()
    ? ` ${C_MUTED}· ✗ models.dev${RESET}`
    : "";
  const right = statusMessage
    ? `${C_WARNING}${statusMessage}${RESET}`
    : state.planMode
      ? `${C_AI}◈ PLAN MODE${RESET}${C_MUTED} · /plan to exit${RESET}`
      : debugMode
        ? `${C_ERROR}⏺ DEBUG${RESET}${C_MUTED} · /debug to stop${RESET}`
        : `${C_ACTION}MCP connected${RESET}${gatewayTag}`;

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

  const hintWidth = visibleTextWidth(reimportHint);
  const gap = "  ";
  const maxLeftWidth = Math.max(0, w - hintWidth - gap.length);
  const clippedLeft = truncateVisible(left, maxLeftWidth);
  const paddingWidth = Math.max(
    0,
    w - visibleTextWidth(clippedLeft) - hintWidth,
  );
  return fitLine(clippedLeft + " ".repeat(paddingWidth) + reimportHint, w);
}

function formatTaskStatusIcon(status: TaskListItem["status"]): string {
  switch (status) {
    case "completed":
      return `${C_SUCCESS}✓${RESET}`;
    case "in_progress":
      return `${C_AI}●${RESET}`;
    default:
      return `${C_MUTED}○${RESET}`;
  }
}

function formatToggleHint(key: string, label: string, enabled: boolean): string {
  return enabled
    ? `${C_ACTION}${key}${RESET} ${C_WHITE}${label}${RESET} ${C_SUCCESS}on${RESET}`
    : `${C_ACTION}${key}${RESET} ${C_GRAY}${label}${RESET}`;
}

function renderChangedSummary(summary: ChangedSummary, w: number): string[] {
  const parts: string[] = [];
  if (summary.newCount) parts.push(`${summary.newCount} new`);
  if (summary.editedCount) parts.push(`${summary.editedCount} edited`);
  if (summary.deletedCount) parts.push(`${summary.deletedCount} deleted`);
  if (summary.renamedCount) parts.push(`${summary.renamedCount} renamed`);

  const lines = [
    fitLine(
      ` ${C_ACTION}${BOLD}CHANGED${RESET}${parts.length ? ` ${C_MUTED}${parts.join(" · ")}${RESET}` : ""}`,
      w,
    ),
  ];

  for (const file of summary.files) {
    lines.push(fitLine(`   ${formatChangedFile(file)}`, w));
  }

  return lines;
}

function formatChangedFile(file: ChangedFileSummary): string {
  const icon = file.kind === "new"
    ? `${C_SUCCESS}+${RESET}`
    : file.kind === "deleted"
      ? `${C_ERROR}-${RESET}`
      : file.kind === "renamed"
        ? `${C_ACTION}→${RESET}`
        : `${C_WARNING}●${RESET}`;

  const location = file.kind === "renamed" && file.previousPath
    ? `${file.previousPath} ${C_MUTED}→${RESET} ${file.path}`
    : file.path;

  const stats = file.additions > 0 || file.deletions > 0
    ? ` ${C_SUCCESS}+${file.additions}${RESET} ${C_ERROR}-${file.deletions}${RESET}`
    : "";

  return `${icon} ${location}${stats}`;
}

interface PlanReviewOption {
  action: PlanReviewAction;
  label: string;
  desc: string;
  tone: "apply" | "cancel" | "revise";
}

const PLAN_REVIEW_OPTIONS: PlanReviewOption[] = [
  {
    action: "apply",
    label: "apply",
    desc: "implement now — planner → coder → reviewer",
    tone: "apply",
  },
  { action: "cancel", label: "no", desc: "cancel — don't implement this plan", tone: "cancel" },
  { action: "revise", label: "revise", desc: "describe what to change", tone: "revise" },
];

export function getPlanReviewOptionActions(): PlanReviewAction[] {
  return PLAN_REVIEW_OPTIONS.map((opt) => opt.action);
}

// ── Plan parser & structured renderer (Direction B) ────────────────

interface ParsedPlan {
  title: string;
  goal: string;
  steps: PlanStep[];
  files: PlanFile[];
}

interface PlanStep {
  num: number;
  text: string;
  files: string[]; // file paths mentioned in this step
}

interface PlanFile {
  path: string;
  status: "new" | "mod" | "del";
  lines?: string; // e.g. "+351 −4"
}

/**
 * Parse planner markdown output into structured plan data.
 * Handles common planner formats:
 *   ## Plan — title
 *   goal description
 *   1. Step text with `file.ts` mentions
 *   2. Another step
 *   ### Affected Files
 *   - new file.ts (+100 −0)
 *   - mod other.ts (+10 −2)
 */
export function parsePlanMarkdown(md: string): ParsedPlan {
  const lines = md.split("\n");
  let title = "Plan";
  let goal = "";
  const steps: PlanStep[] = [];
  const files: PlanFile[] = [];

  let currentStep: PlanStep | null = null;
  let section: "body" | "files" = "body";

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Title: ## Plan — title  OR  ## Plan: title  OR  ## Plan
    const titleMatch = line.match(/^##+\s+Plan\s*[—:–]\s*(.+)/i)
      ?? line.match(/^##+\s+Plan\s*$/i);
    if (titleMatch) {
      title = titleMatch[1]?.trim() || "Plan";
      continue;
    }

    // Section headers
    if (/^##+ Affected Files/i.test(line) || /^##+ Files/i.test(line) || /^### Files/i.test(line)) {
      section = "files";
      continue;
    }
    if (/^##+ /.test(line) && !/^##+ Plan/i.test(line)) {
      section = "body";
    }

    if (section === "files") {
      // File line: - new path/to/file.ts (+100 −0)  OR  - path/to/file.ts
      const fileMatch = line.match(/^[-*]\s+(new|mod|del|added|modified|deleted)\s+`?([\w./\-_.]+)`?\s*(?:[+(]([^)]*[−\-]\d+[^)]*)\))?/i)
        ?? line.match(/^[-*]\s+`?([\w./\-_.]+)`?\s*(?:[+(]([^)]*[−\-]\d+[^)]*)\))?/);
      if (fileMatch) {
        if (fileMatch[2]) {
          // Format: - status path (lines)
          const rawStatus = fileMatch[1].toLowerCase();
          const status: PlanFile["status"] =
            rawStatus === "new" || rawStatus === "added" ? "new"
              : rawStatus === "del" || rawStatus === "deleted" ? "del"
                : "mod";
          files.push({ path: fileMatch[2], status, lines: fileMatch[3]?.trim() });
        } else {
          // Format: - path (lines)  — assume mod
          files.push({ path: fileMatch[1], status: "mod", lines: fileMatch[2]?.trim() });
        }
      }
      continue;
    }

    // Numbered step: 1. Step text
    const stepMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (stepMatch) {
      if (currentStep) steps.push(currentStep);
      const num = parseInt(stepMatch[1], 10);
      currentStep = { num, text: stepMatch[2], files: [] };
      continue;
    }

    // Goal / description line (non-empty, non-heading, before first step)
    if (!currentStep && !titleMatch && line.trim() && !/^#{1,3}\s/.test(line)) {
      goal = goal ? `${goal} ${line.trim()}` : line.trim();
      continue;
    }

    // Continuation of current step
    if (currentStep && line.trim()) {
      currentStep.text += ` ${line.trim()}`;
    }
  }
  if (currentStep) steps.push(currentStep);

  // Extract file mentions from steps if no explicit files section
  if (files.length === 0) {
    const fileSet = new Map<string, PlanFile>();
    for (const step of steps) {
      // Match backtick-quoted file paths in step text
      const matches = step.text.matchAll(/`([\w./\-_.]+\.\w+)`/g);
      for (const m of matches) {
        if (!fileSet.has(m[1])) {
          fileSet.set(m[1], { path: m[1], status: "new" });
        }
        step.files.push(m[1]);
      }
    }
    files.push(...fileSet.values());
  }

  return { title, goal, steps, files };
}

function renderRule(w: number, width?: number): string {
  return `${DIM}${C_MUTED}${"─".repeat(Math.min(w - 4, width ?? 40))}${RESET}`;
}

function renderPlanContent(plan: string, w: number): string[] {
  const parsed = parsePlanMarkdown(plan);
  const lines: string[] = [];
  const innerRule = `${DIM}${C_MUTED}${"─".repeat(Math.min(w - 8, 36))}${RESET}`;

  // Plan header
  lines.push(
    fitLine(`    ${C_AI}◈${RESET} ${C_WHITE}${BOLD}Plan · ${parsed.title}${RESET}`, w),
  );
  if (parsed.goal) {
    lines.push(fitLine(`    ${C_GRAY}${parsed.goal}${RESET}`, w));
  }
  lines.push(fitLine(`    ${innerRule}`, w));

  // Steps block
  if (parsed.steps.length > 0) {
    lines.push(fitLine(`    ${C_MUTED}STEPS${RESET}`, w));
    for (const step of parsed.steps) {
      const num = `${C_AI}${BOLD}${step.num}${RESET}`;
      lines.push(fitLine(`      ${num}  ${C_WHITE}${step.text}${RESET}`, w));
    }
    lines.push(fitLine(``, w));
  }

  // Affected files block
  if (parsed.files.length > 0) {
    lines.push(fitLine(`    ${C_MUTED}AFFECTED FILES${RESET}`, w));
    for (const file of parsed.files) {
      const statusIcon =
        file.status === "new" ? `${C_SUCCESS}+${RESET}`
          : file.status === "del" ? `${C_ERROR}−${RESET}`
            : `${C_WARNING}~${RESET}`;
      const statusLabel =
        file.status === "new" ? `${C_SUCCESS}new${RESET}`
          : file.status === "del" ? `${C_ERROR}del${RESET}`
            : `${C_WARNING}mod${RESET}`;
      const lineInfo = file.lines ? ` ${C_GRAY}${file.lines}${RESET}` : "";
      lines.push(
        fitLine(`      ${statusIcon} ${C_ACTION}${file.path}${RESET}  ${statusLabel}${lineInfo}`, w),
      );
    }
    lines.push(fitLine(``, w));
  }

  return lines;
}

function renderPlanReviewOption(opt: PlanReviewOption, idx: number, selected: boolean, w: number): string {
  const num = `${C_MUTED}${idx + 1}.${RESET}`;
  const prefix = selected ? `${C_ACTION}>${RESET}` : " ";
  const labelColor =
    opt.tone === "cancel" ? C_ERROR : opt.tone === "revise" ? C_WARNING : C_SUCCESS;
  const label = selected
    ? `${labelColor}${BOLD}${opt.label}${RESET}`
    : `${labelColor}${opt.label}${RESET}`;
  return fitLine(`    ${prefix} ${num} ${label}  ${C_GRAY}${opt.desc}${RESET}`, w);
}

function renderTaskList(tasks: TaskListItem[], w: number): string[] {
  const lines: string[] = [];
  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;
  const header = ` ${C_WHITE}${BOLD}Tasks${RESET} ${C_MUTED}(${completed}/${total})${RESET}`;
  lines.push(fitLine(header, w));

  for (const task of tasks) {
    const icon = formatTaskStatusIcon(task.status);
    const text =
      task.status === "completed"
        ? `${C_MUTED}${task.content}${RESET}`
        : task.status === "in_progress"
          ? `${C_WHITE}${BOLD}${task.content}${RESET}`
          : `${C_WHITE}${task.content}${RESET}`;
    const activeForm =
      task.status === "in_progress" && task.activeForm
        ? ` ${C_MUTED}${task.activeForm}${RESET}`
        : "";
    lines.push(fitLine(`  ${icon} ${text}${activeForm}`, w));
  }

  return lines;
}

export function buildPanel(
  state: UIState,
  w: number,
  ctx: PanelContext,
): PanelResult {
  const { editor, frame, shellMode, debugMode, statusMessage, modelPickerActive } = ctx;

  const out: string[] = [];
  const sep = `${DIM}${C_MUTED}${"─".repeat(Math.min(w - 4, 40))}${RESET}`;

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
          `${C_ACTION}PgUp/Dn${RESET} ${C_GRAY}scroll${RESET}  ` +
          formatToggleHint("Ctrl+T", "tasks", state.taskListVisible) +
          `  ${formatToggleHint("Ctrl+E", "expand", state.previewDiffExpanded)}`,
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
    const usage =
      promptTok > 0 || completionTok > 0
        ? ` · ${[
            promptTok > 0 ? `↑${formatTokenCount(promptTok)}` : "",
            completionTok > 0 ? `↓${formatTokenCount(completionTok)}` : "",
          ]
            .filter(Boolean)
            .join(" ")} tok`
        : "";
    const tool =
      state.task.phase === "tool" && state.task.toolName
        ? ` · ${state.task.toolName}`
        : "";
    const displayModel = getResolvedModel() ?? "";
    const model = displayModel
      ? ` ${C_GRAY}${truncate(displayModel, 28)}${RESET}`
      : "";
    const effort = state.task.effort
      ? ` ${C_MUTED}· ${state.task.effort}${RESET}`
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
        ` ${marker} ${phaseColor}${label}${RESET}${model}${effort}${tool} ${C_MUTED}· ${elapsed}${usage}${RESET}`,
        w,
      ),
    );
  }

  // Task list widget — shows tracked tasks when visible.
  if (state.taskListVisible && state.taskList.length > 0) {
    out.push(...renderTaskList(state.taskList, w));
  }

  if (state.changedSummary && state.changedSummary.files.length > 0) {
    out.push(...renderChangedSummary(state.changedSummary, w));
  }

  // Background synthesis indicator.
  if (state.synthRunning) {
    out.push(
      fitLine(
        ` ${C_AI}${SPINNER[frame]}${RESET} ${C_GRAY}synthesizing context ${C_MUTED}(conventions · rules)…${RESET}`,
        w,
      ),
    );
  }

  // ask_user prompt — AI is waiting for an inline answer.
  if (state.askQuestion != null) {
    const { question, options, selection, selectionMode, selected = [] } = state.askQuestion;
    const isMultiSelect = selectionMode === "multi_select";
    const questionLines = question.split("\n");

    // Top separator
    out.push(fitLine(`  ${sep}`, w));

    // First line with ? prefix, subsequent lines indented
    for (let i = 0; i < questionLines.length; i++) {
      const ql = questionLines[i];
      if (i === 0) {
        out.push(fitLine(`    ${C_AI}? ${RESET}${C_WHITE}${BOLD}${ql}${RESET}`, w));
      } else {
        out.push(fitLine(`      ${C_WHITE}${ql}${RESET}`, w));
      }
    }

    // Sub-separator
    out.push(fitLine(`    ${DIM}${C_MUTED}${"─".repeat(Math.min(w - 8, 36))}${RESET}`, w));

    if (options && options.length > 0) {
      for (const [idx, opt] of options.entries()) {
        const focused = idx === (selection ?? 0);
        const checked = selected.includes(idx);
        const num = `${C_MUTED}${idx + 1}.${RESET}`;
        const checkbox = isMultiSelect ? `${C_MUTED}[${checked ? "x" : " "}]${RESET}` : "";
        const prefix = focused ? `${C_ACTION}>${RESET}` : " ";
        const label = focused
          ? `${C_WHITE}${BOLD}${opt.label}${RESET}`
          : `${C_WHITE}${opt.label}${RESET}`;
        const desc = opt.description
          ? `  ${C_GRAY}${opt.description}${RESET}`
          : "";
        out.push(fitLine(`    ${prefix} ${num} ${checkbox}${checkbox ? " " : ""}${label}${desc}`, w));
      }
      // Spacer between options and hint text
      out.push(fitLine(``, w));

      // Help text
      out.push(
        fitLine(
          isMultiSelect
            ? `    ${C_ACTION}↑↓${RESET} ${C_GRAY}move · ${RESET}${C_ACTION}Space${RESET} ${C_GRAY}toggle · ${RESET}${C_ACTION}Enter${RESET} ${C_GRAY}confirm · ${RESET}${C_ACTION}Esc${RESET} ${C_GRAY}skip${RESET}`
            : `    ${C_ACTION}↑↓${RESET} ${C_GRAY}select · ${RESET}${C_ACTION}Enter${RESET} ${C_GRAY}confirm · ${RESET}${C_ACTION}Esc${RESET} ${C_GRAY}skip${RESET}`,
          w,
        ),
      );
    } else {
      // Spacer before hint text
      out.push(fitLine(``, w));

      out.push(
        fitLine(
          `    ${C_GRAY}Type answer + ${RESET}${C_ACTION}Enter${RESET}${C_GRAY} to reply · ${RESET}${C_ACTION}Esc${RESET} ${C_GRAY}skip${RESET}`,
          w,
        ),
      );
    }

    // Bottom separator
    out.push(fitLine(`  ${sep}`, w));
  } else if (state.toolApproval != null) {
    const ta = state.toolApproval;
    const sel = ta.selection ?? 0;
    const TOOL_OPTIONS = [
      { label: "Approve", desc: "Allow this tool call once" },
      { label: "Decline", desc: "Block this tool call" },
      { label: "Always Allow", desc: "Allow this tool category for the session" },
    ];

    // Top separator
    out.push(fitLine(`  ${sep}`, w));

    // Tool name header
    out.push(fitLine(`    ${C_ACTION}⚠${RESET} ${C_WHITE}${BOLD}Tool approval required${RESET}`, w));
    out.push(fitLine(`    ${C_AI}${ta.toolName}${RESET}`, w));

    // Args preview (truncate to 6 lines max)
    if (ta.args) {
      const argsStr = typeof ta.args === "string" ? ta.args : JSON.stringify(ta.args, null, 2);
      const argLines = argsStr.split("\n").slice(0, 6);
      if (argsStr.split("\n").length > 6) argLines.push("  ...");
      out.push(fitLine(`    ${C_MUTED}${"─".repeat(Math.min(w - 8, 36))}${RESET}`, w));
      const contentW = Math.max(w - 8, 20);
      for (const line of argLines) {
        const truncated = truncateVisible(line, contentW);
        out.push(fitLine(`    ${C_GRAY}${truncated}${RESET}`, w));
      }
    }

    // Sub-separator
    out.push(fitLine(`    ${C_MUTED}${"─".repeat(Math.min(w - 8, 36))}${RESET}`, w));

    for (const [idx, opt] of TOOL_OPTIONS.entries()) {
      const focused = idx === sel;
      const num = `${C_MUTED}${idx + 1}.${RESET}`;
      const prefix = focused ? `${C_ACTION}>${RESET}` : " ";
      const label = focused
        ? `${C_WHITE}${BOLD}${opt.label}${RESET}`
        : `${C_WHITE}${opt.label}${RESET}`;
      out.push(fitLine(`    ${prefix} ${num} ${label}  ${C_GRAY}${opt.desc}${RESET}`, w));
    }

    // Help text
    out.push(fitLine(``, w));
    out.push(
      fitLine(
        `    ${C_ACTION}↑↓${RESET} ${C_GRAY}select · ${RESET}${C_ACTION}Enter${RESET} ${C_GRAY}confirm · ${RESET}${C_ACTION}Esc${RESET} ${C_GRAY}decline${RESET}`,
        w,
      ),
    );

    // Bottom separator
    out.push(fitLine(`  ${sep}`, w));
  } else if (state.planReview?.active) {
    const sel = Math.max(
      0,
      Math.min(state.planReview.selection ?? 0, PLAN_REVIEW_OPTIONS.length - 1),
    );
    const reviseMode = state.planReview.reviseMode ?? false;
    const reviewRule = renderRule(w, 56);
    const innerRule = `${DIM}${C_MUTED}${"─".repeat(Math.min(w - 8, 36))}${RESET}`;

    // Render structured plan content above the review dock
    if (state.planContent && !reviseMode) {
      out.push(...renderPlanContent(state.planContent, w));
    }

    out.push(fitLine(`  ${reviewRule}`, w));

    if (reviseMode) {
      out.push(
        fitLine(`    ${C_WARNING}◈${RESET} ${C_WHITE}${BOLD}Revise plan${RESET}`, w),
      );
      out.push(fitLine(`    ${innerRule}`, w));
      out.push(
        fitLine(
          `    ${C_GRAY}Describe what to change, then press ${RESET}${C_ACTION}Enter${RESET}${C_GRAY} to submit${RESET}`,
          w,
        ),
      );
      out.push(
        fitLine(
          `    ${C_MUTED}›${RESET} ${C_GRAY}Type feedback in the prompt below${RESET}`,
          w,
        ),
      );
      out.push(fitLine(``, w));
      out.push(
        fitLine(`    ${C_ACTION}Esc${RESET} ${C_GRAY}back to options${RESET}`, w),
      );
    } else {
      out.push(
        fitLine(`    ${C_AI}◈${RESET} ${C_WHITE}${BOLD}Plan ready${RESET}`, w),
      );
      out.push(fitLine(`    ${innerRule}`, w));

      for (const [idx, opt] of PLAN_REVIEW_OPTIONS.entries()) {
        out.push(renderPlanReviewOption(opt, idx, idx === sel, w));
      }

      out.push(fitLine(``, w));
      out.push(
        fitLine(
          `    ${C_ACTION}↑↓${RESET} ${C_GRAY}select · ${RESET}${C_ACTION}Enter${RESET} ${C_GRAY}confirm · ${RESET}${C_ACTION}Esc${RESET} ${C_GRAY}decline${RESET}`,
          w,
        ),
      );
    }

    out.push(fitLine(`  ${reviewRule}`, w));
  } else {
    out.push(
      fitLine(
        `  ${C_ACTION}Tab${RESET} ${C_GRAY}complete${RESET}` +
          `  ${C_ACTION}↑↓${RESET} ${C_GRAY}history${RESET}` +
          `  ${C_ACTION}@${RESET} ${C_GRAY}files${RESET}` +
          `  ${C_ACTION}!${RESET} ${C_GRAY}shell${RESET}` +
          `  ${C_ACTION}/help${RESET} ${C_GRAY}commands${RESET}` +
          `  ${formatToggleHint("Ctrl+E", "expand", state.previewDiffExpanded)}` +
          `  ${formatToggleHint("Ctrl+T", "tasks", state.taskListVisible)}` +
          `  ${C_ACTION}Ctrl+C${RESET} ${C_GRAY}exit${RESET}`,
        w,
      ),
    );
  }

  // Editor + autocomplete.
  // When a picker is active, show a navigation hint above the editor.
  if (modelPickerActive) {
    out.push(
      fitLine(
        `  ${C_ACTION}↑↓${RESET} ${C_GRAY}navigate  ${RESET}${C_ACTION}Enter${RESET}${C_GRAY}/${RESET}${C_ACTION}Tab${RESET} ${C_GRAY}select model  ${RESET}${C_ACTION}Esc${RESET} ${C_GRAY}cancel${RESET}`,
        w,
      ),
    );
  }
  const editorLines = renderEditor(editor, w, shellMode, debugMode);
  out.push(...editorLines);

  // Status bar.
  out.push(buildStatusBar(state, w, debugMode, statusMessage));

  return { lines: out };
}
