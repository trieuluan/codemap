/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import {
  terminalDraw,
  lengthConstraint,
  createLayout,
  splitLayout,
} from "terminui";
import type { Terminal, Frame, Rect } from "terminui";
import { renderJsx } from "terminui/jsx";
import type { UIState } from "./store.js";

// JSX blocks — dialogs only
import { ConfirmDialog } from "./blocks/confirm-dialog.js";
import { SubprocessLog } from "./blocks/subprocess-log.js";
import { renderHeader } from "./blocks/header.js";

// Widget renderers
import { renderHelpHints } from "./blocks/help-text.js";
import { renderStatusLine } from "./blocks/status-line.js";
import { renderMessages } from "./widgets/messages.js";
import { renderInputComposer } from "./widgets/input-composer.js";
import { renderTaskStatus } from "./widgets/task-status.js";
import { renderHelpScreen } from "./widgets/help-screen.js";

export function render(
  terminal: Terminal,
  state: UIState,
  spinnerFrame: number,
): void {
  terminalDraw(terminal, (frame: Frame) => {
    const area = frame.area;

    if (state.screen === "help") {
      renderHelpScreen(frame, area);
      return;
    }

    renderMainChat(frame, state, spinnerFrame, area);
  });
}

function renderMainChat(
  frame: Frame,
  state: UIState,
  spinnerFrame: number,
  area: Rect,
): void {
  const taskActive = state.task.phase !== "idle";

  const bannerLines = 11;
  // +3 for subtitle + info pills + quick start; +2 for top/bottom borders
  const headerH = bannerLines + 3 + 2;
  const helpH = 1;
  const statusH = 1;
  const inputH = 3;
  const taskH = taskActive ? 1 : 0;
  const confirmH = state.confirm.active ? 8 : 0;
  const subprocessH = state.subprocess.active ? 12 : 0;

  const usedH =
    headerH + helpH + statusH + inputH + taskH + confirmH + subprocessH;
  const msgH = Math.max(1, area.height - usedH);

  const constraints = [
    lengthConstraint(headerH),
    lengthConstraint(helpH),
    lengthConstraint(msgH),
    ...(taskActive ? [lengthConstraint(taskH)] : []),
    ...(state.confirm.active ? [lengthConstraint(confirmH)] : []),
    ...(state.subprocess.active ? [lengthConstraint(subprocessH)] : []),
    lengthConstraint(inputH),
    lengthConstraint(statusH),
  ];

  const layout = createLayout(constraints, { direction: "vertical" });
  const areas = splitLayout(layout, area);

  let idx = 0;

  renderHeader(frame, state, areas[idx++]!);
  renderHelpHints(frame, areas[idx++]!);
  renderMessages(frame, state.messages, areas[idx++]!);

  if (taskActive) {
    renderTaskStatus(frame, state, spinnerFrame, areas[idx++]!);
  }

  if (state.confirm.active) {
    renderJsx(frame, <ConfirmDialog state={state} />, areas[idx++]!);
  }

  if (state.subprocess.active) {
    renderJsx(frame, <SubprocessLog state={state} />, areas[idx++]!);
  }

  renderInputComposer(frame, state, areas[idx++]!);
  renderStatusLine(frame, state, areas[idx++]!);
}
