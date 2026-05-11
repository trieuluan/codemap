/** @jsxRuntime automatic */
/** @jsxImportSource terminui */
import { terminalResize } from "terminui";
import type { Terminal } from "terminui";
import { terminalDrawJsx, Column } from "terminui/jsx";

import type { UIState } from "./store.js";
import { HeaderBlock } from "./blocks/header.js";
import { MessagesBlock } from "./blocks/messages.js";
import { TaskStatusBlock } from "./blocks/task-status.js";
import { ConfirmDialogBlock } from "./blocks/confirm-dialog.js";
import { SubprocessLogBlock } from "./blocks/subprocess-log.js";
import { StatusLineBlock } from "./blocks/status-line.js";
import { HelpTextBlock } from "./blocks/help-text.js";

export type { Terminal };

export function render(terminal: Terminal, state: UIState, spinnerFrame: number): void {
  const w = state.viewport.width;
  const h = state.viewport.height;

  terminalResize(terminal, { width: w, height: h });

  terminalDrawJsx(terminal, (frame) => {
    return (
      <Column>
        <HeaderBlock state={state} />
        <HelpTextBlock state={state} />
        <MessagesBlock state={state} />
        <TaskStatusBlock state={state} spinnerFrame={spinnerFrame} />
        <ConfirmDialogBlock state={state} />
        <SubprocessLogBlock state={state} />
        <StatusLineBlock state={state} />
      </Column>
    );
  });
}
