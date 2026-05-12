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

// JSX blocks — small single-child components
import { HelpText } from "./blocks/help-text.js";
import { StatusLine } from "./blocks/status-line.js";
import { ConfirmDialog } from "./blocks/confirm-dialog.js";
import { SubprocessLog } from "./blocks/subprocess-log.js";
import { renderHeader } from "./blocks/header.js";

// Widget renderers — rendered via frameRenderWidget
import { renderMessages } from "./widgets/messages.js";
import { renderInputComposer } from "./widgets/input-composer.js";
import { renderTaskStatus } from "./widgets/task-status.js";
import { renderHelpScreen } from "./widgets/help-screen.js";

/**
 * Hybrid renderer:
 *
 * renderJsx         → single-child blocks (help-text, status-line, dialogs)
 * frameRenderWidget → startup, help, header, messages, input, task status
 */
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

  const bannerLines = 11; // cfonts "simple" produces ~8 lines for "CODEMAP"
  const headerH = bannerLines + 2 + 2; // +2 for subtitle+info, +2 for border top/bottom
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

  // Widget: header with gradient banner
  renderHeader(frame, state, areas[idx++]!);

  // JSX: single-child help hint
  renderJsx(frame, <HelpText />, areas[idx++]!);

  // Widget: messages
  renderMessages(frame, state.messages, areas[idx++]!);

  // Widget: task status
  if (taskActive) {
    renderTaskStatus(frame, state, spinnerFrame, areas[idx++]!);
  }

  // JSX: confirm dialog (wrapped children via VStack inside Panel)
  if (state.confirm.active) {
    renderJsx(frame, <ConfirmDialog state={state} />, areas[idx++]!);
  }

  // JSX: subprocess log (wrapped children via VStack inside Panel)
  if (state.subprocess.active) {
    renderJsx(frame, <SubprocessLog state={state} />, areas[idx++]!);
  }

  // Widget: input composer
  renderInputComposer(frame, state, areas[idx++]!);

  // JSX: single-child status line
  renderJsx(frame, <StatusLine state={state} />, areas[idx++]!);
}
