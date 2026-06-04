import type { Editor } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { UIState, TaskListItem } from "../../chat/state/store.js";
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
import { isGatewayOffline } from "../stderr-interceptor.js";

function commitsDiffer(localCommit?: string, cloudCommit?: string): boolean {
  if (!localCommit || !cloudCommit) return false;

  const local = localCommit.trim();
  const cloud = cloudCommit.trim();
  if (!local || !cloud) return false;

  return !(local.startsWith(cloud) || cloud.startsWith(local));
}

function formatAge(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
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
    const displayModel = state.task.model ?? "";
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

  // Background synthesis indicator.
  if (state.synthRunning) {
    out.push(
      fitLine(
        ` ${C_AI}${SPINNER[frame]}${RESET} ${C_GRAY}synthesizing context ${C_MUTED}(conventions · rules · skills)…${RESET}`,
        w,
      ),
    );
  }

  // ask_user prompt — AI is waiting for an inline answer.
  if (state.askQuestion?.active) {
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
  } else if (state.planReview?.active) {
    const sel = state.planReview.selection ?? 0;
    const reviseMode = state.planReview.reviseMode ?? false;
    const PLAN_OPTIONS = [
      {
        label: "apply",
        desc: "Proceed with implementation (planner → coder → reviewer)",
      },
      { label: "no", desc: "Cancel — don't implement this plan" },
      { label: "revise", desc: "Request changes to the plan" },
    ];

    // Top separator
    out.push(fitLine(`  ${sep}`, w));

    if (reviseMode) {
      // Revise input mode: prompt user to type feedback.
      out.push(
        fitLine(`    ${C_WARNING}◈${RESET} ${C_WHITE}${BOLD}Revise plan${RESET}`, w),
      );
      out.push(fitLine(`    ${DIM}${C_MUTED}${"─".repeat(Math.min(w - 8, 36))}${RESET}`, w));
      out.push(
        fitLine(`    ${C_GRAY}Describe what to change, then press ${RESET}${C_ACTION}Enter${RESET}${C_GRAY} to submit${RESET}`, w),
      );
      out.push(fitLine(``, w));
      out.push(
        fitLine(
          `    ${C_ACTION}Esc${RESET} ${C_GRAY}back to options${RESET}`,
          w,
        ),
      );
    } else {
      // Option selection mode.
      out.push(
        fitLine(`    ${C_AI}◈${RESET} ${C_WHITE}${BOLD}Plan ready${RESET}`, w),
      );

      // Sub-separator
      out.push(fitLine(`    ${DIM}${C_MUTED}${"─".repeat(Math.min(w - 8, 36))}${RESET}`, w));

      // Options
      for (const [idx, opt] of PLAN_OPTIONS.entries()) {
        const selected = idx === sel;
        const num = `${C_MUTED}${idx + 1}.${RESET}`;
        const prefix = selected ? `${C_ACTION}>${RESET}` : " ";
        const isNo = opt.label === "no";
        const isRevise = opt.label === "revise";
        const labelColor = isNo ? C_ERROR : isRevise ? C_WARNING : C_WHITE;
        const label = selected
          ? `${labelColor}${BOLD}${opt.label}${RESET}`
          : `${labelColor}${opt.label}${RESET}`;
        out.push(
          fitLine(`    ${prefix} ${num} ${label}  ${C_GRAY}${opt.desc}${RESET}`, w),
        );
      }

      // Spacer between options and hint text
      out.push(fitLine(``, w));

      // Help text
      out.push(
        fitLine(
          `    ${C_ACTION}↑↓${RESET} ${C_GRAY}select · ${RESET}${C_ACTION}Enter${RESET} ${C_GRAY}confirm${RESET}`,
          w,
        ),
      );
    }

    // Bottom separator
    out.push(fitLine(`  ${sep}`, w));
  } else if (state.treePicker?.active) {
    const tp = state.treePicker;
    const items = tp.items;
    const sel = tp.selectedIndex;
    const FILTER_LABELS = ["default", "no-tools", "user-only", "all"];

    // Safe fit: truncate with pi-tui's own width calc, then pad with spaces
    const safeFit = (line: string): string => {
      const truncated = truncateToWidth(line, w);
      return truncated + " ".repeat(Math.max(0, w - visibleWidth(truncated)));
    };

    // Top separator
    out.push(safeFit(`  ${sep}`));
    out.push(
      safeFit(
        `    ${C_AI}🌳${RESET} ${C_WHITE}${BOLD}Session Tree${RESET}  ${C_GRAY}· filter: ${RESET}${C_ACTION}${FILTER_LABELS[tp.filterMode] ?? "default"}${RESET}${C_GRAY}${RESET}`,
      ),
    );
    out.push(safeFit(`    ${DIM}${C_MUTED}${"─".repeat(Math.min(w - 8, 50))}${RESET}`));

    // Calculate available lines for the tree (reserve ~5 lines for header/footer)
    const treeHeight = Math.max(5, Math.min(items.length, 20));

    // Windowed: center selection in the visible area
    let windowStart = 0;
    if (items.length > treeHeight) {
      windowStart = Math.max(0, sel - Math.floor(treeHeight / 2));
      windowStart = Math.min(windowStart, items.length - treeHeight);
    }
    const windowEnd = Math.min(items.length, windowStart + treeHeight);

    // Compute depths that are actual branch points (have multiple children)
    const branchDepths = new Set<number>();
    for (let j = windowStart; j < windowEnd - 1; j++) {
      const d = items[j]!.depth;
      const nd = items[j + 1]!.depth;
      if (nd > d) {
        // items[j] has a child at depth nd
        // Check if there's another item at depth nd later (sibling)
        for (let k = j + 2; k < windowEnd; k++) {
          if (items[k]!.depth === nd) { branchDepths.add(nd); break; }
          if (items[k]!.depth < nd) break;
        }
      }
    }

    for (let i = windowStart; i < windowEnd; i++) {
      const item = items[i]!;
      const isSel = i === sel;
      const isUser = item.type === "user";
      const isGroupHeader = isUser;
      const nextItem = i < windowEnd - 1 ? items[i + 1]! : null;
      const nextDepth = nextItem?.depth ?? 0;

      // Compute visual depth: count only ancestor depths that are actual branches
      let visualDepth = 0;
      for (let d = 1; d < item.depth; d++) {
        if (branchDepths.has(d)) visualDepth++;
      }

      // Build tree prefix with connectors (Pi.dev-style)
      let treePrefix = "";
      if (visualDepth > 0) {
        const totalChars = visualDepth * 3;
        const prefixChars: string[] = [];
        for (let ci = 0; ci < totalChars; ci++) {
          const level = Math.floor(ci / 3);
          const posInLevel = ci % 3;
          // Show │ at ancestor gutters
          if (level < visualDepth - 1) {
            prefixChars.push(posInLevel === 0 ? "│" : " ");
          } else {
            // Last level: connector
            if (posInLevel === 0) prefixChars.push(nextDepth >= item.depth ? "├" : "└");
            else if (posInLevel === 1) prefixChars.push("─");
            else prefixChars.push(" ");
          }
        }
        treePrefix = prefixChars.join("");
      }

      // Group separator before user message groups (except first)
      if (isGroupHeader && i > windowStart) {
        out.push(safeFit(`    ${C_MUTED}${"─".repeat(Math.min(w - 8, 40))}${RESET}`));
      }

      // Status marker
      let marker = "";
      if (isGroupHeader) {
        // User messages: ▸ group header
        marker = item.isLeaf
          ? ` ${C_SUCCESS}◀${RESET}`
          : item.isActive
            ? ` ${C_ACTION}▸${RESET}`
            : ` ${C_MUTED}▸${RESET}`;
      } else if (item.isLeaf) {
        marker = ` ${C_SUCCESS}◀ leaf${RESET}`;
      } else if (item.isActive) {
        marker = ` ${C_SUCCESS}●${RESET}`;
      } else {
        marker = ` ${C_MUTED}○${RESET}`;
      }

      // Branch point badge
      let branchTag = "";
      if (item.isBranchPoint) {
        branchTag = ` ${C_WARNING}⑂${item.childCount}${RESET}`;
      }

      // Fold indicator for branch points
      const foldTag = item.isBranchPoint && tp.foldedIds.has(item.entryId) ? ` ${C_GRAY}[+]${RESET}` : "";

      // Type label for non-user entries
      let typeLabel = "";
      if (!isUser) {
        if (item.type === "tool") {
          typeLabel = ` ${C_MUTED}[tool]${RESET}`;
        } else if (item.type === "system") {
          typeLabel = ` ${C_MUTED}[sys]${RESET}`;
        } else if (item.type === "branch_summary") {
          typeLabel = ` ${C_WARNING}[summary]${RESET}`;
        } else if (item.type === "assistant") {
          typeLabel = ` ${C_GRAY}[assistant]${RESET}`;
        }
      }

      // Content
      const content = (item.content || item.entryId.slice(0, 8));

      // Selection prefix
      const prefix = isSel ? `${C_ACTION}>${RESET}` : " ";

      // Style: selected = cyan bold, active-path = white bold, inactive = gray
      let textStyle: string;
      if (isSel) {
        textStyle = `${C_ACTION}${BOLD}`;
      } else if (isGroupHeader) {
        textStyle = item.isActive ? `${C_WHITE}${BOLD}` : `${C_GRAY}`;
      } else {
        textStyle = item.isActive ? C_WHITE : C_GRAY;
      }

      // Tree prefix with connectors (Pi.dev-style)
      out.push(
        safeFit(
          `    ${prefix}${treePrefix}${textStyle}${content}${RESET}${marker}${branchTag}${foldTag}${typeLabel}`,
        ),
      );

      // Show timestamp line below selected item
      if (isSel) {
        const age = formatAge(item.timestamp);
        out.push(
          safeFit(`      ${C_GRAY}${age}${RESET}`),
        );
      }
    }

    // Scroll indicator
    if (items.length > treeHeight) {
      out.push(
        safeFit(
          `    ${C_GRAY}… ${sel + 1}/${items.length}${RESET}`,
        ),
      );
    }

    // Spacer + help text
    out.push(safeFit(``));
    out.push(
      safeFit(
        `    ${C_ACTION}↑↓${RESET}${C_GRAY} navigate · ${RESET}${C_ACTION}←→${RESET}${C_GRAY} page · ${RESET}${C_ACTION}Ctrl+←${RESET}${C_GRAY} fold/unfold · ${RESET}${C_ACTION}Ctrl+O${RESET}${C_GRAY} filter · ${RESET}${C_ACTION}Enter${RESET}${C_GRAY} select · ${RESET}${C_ACTION}Esc${RESET}${C_GRAY} cancel${RESET}`,
      ),
    );

    // Bottom separator
    out.push(safeFit(`  ${sep}`));
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
