import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const terminalKit = require("terminal-kit") as typeof import("terminal-kit");
const term = terminalKit.terminal;

import type { UIState } from "./store.js";
import { renderHeader } from "./blocks/header.js";
import { renderMessages } from "./blocks/messages.js";
import { renderTaskStatus } from "./blocks/task-status.js";
import { renderConfirmDialog } from "./blocks/confirm-dialog.js";
import { renderSubprocessLog } from "./blocks/subprocess-log.js";
import { renderStatusLine } from "./blocks/status-line.js";
import { renderHelpText } from "./blocks/help-text.js";
import { drawKeycap } from "./blocks/helpers.js";

export { term };

export function render(state: UIState, spinnerFrame: number): void {
  term.clear();

  // Header (banner + startup card)
  renderHeader(term, state);

  // Help text with keycap shortcuts
  renderHelpText(term, state);

  // Messages (scrollable conversation area)
  renderMessages(term, state);

  // Task status (thinking/tool/streaming/done)
  renderTaskStatus(term, state, spinnerFrame);

  // Confirm dialog (modal)
  renderConfirmDialog(term, state);

  // Subprocess log
  renderSubprocessLog(term, state);

  // Status line
  renderStatusLine(term, state);

  // Shortcut footer
  renderShortcutFooter(term);

  // Input prompt
  term("\n");
  term.bold.cyan("  > ");
}

type Terminal = typeof terminalKit.terminal;

function renderShortcutFooter(term: Terminal): void {
  const width = term.width || 80;
  const hLine = "─".repeat(Math.min(width - 4, 76));

  term("\n  ");
  term.dim.gray(hLine);
  term("\n  ");
  drawKeycap(term, "/", "commands");
  drawKeycap(term, "@", "files");
  drawKeycap(term, "Tab", "suggestions");
  drawKeycap(term, "Ctrl+C", "cancel");
  drawKeycap(term, "?", "help");
  term("\n");
}
