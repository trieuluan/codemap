import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import type { UIState } from "../store.js";
import { formatElapsed, formatTokenCount } from "./helpers.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function renderTaskStatus(
  term: Terminal,
  state: UIState,
  spinnerFrame: number,
): void {
  const { task } = state;
  if (task.phase === "idle") return;

  const elapsed = task.startTime
    ? (task.endTime ?? Date.now()) - task.startTime
    : 0;
  const elapsedStr = formatElapsed(elapsed);
  const spinner = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];

  term("\n  ");
  term.dim.gray("│ ");

  switch (task.phase) {
    case "thinking":
      term.cyan(spinner);
      term.white(" Thinking");
      term.dim.gray(` ${elapsedStr}`);
      if (task.model) term.dim.cyan(` · ${task.model}`);
      break;

    case "tool":
      term.yellow(spinner);
      term.yellow(` ${task.toolName ?? "tool"}`);
      term.dim.gray(` ${elapsedStr}`);
      if (task.toolArgs) {
        term("\n  ");
        term.dim.gray("│ ");
        term.dim.gray(
          task.toolArgs.length > 100
            ? task.toolArgs.slice(0, 100) + "..."
            : task.toolArgs,
        );
      }
      break;

    case "streaming":
      term.cyan("↓");
      term.white(" Streaming");
      term.dim.gray(` ${elapsedStr}`);
      if (task.usage) {
        term.dim.gray(
          ` · ${formatTokenCount(task.usage.promptTokens)} in / ${formatTokenCount(task.usage.completionTokens)} out`,
        );
      }
      break;

    case "done":
      term.green("✓");
      term.white(` ${elapsedStr}`);
      if (task.toolsCalled > 0) {
        term.dim.gray(
          ` · ${task.toolsCalled} tool${task.toolsCalled > 1 ? "s" : ""}`,
        );
      }
      if (task.usage) {
        term.dim.gray(` · ${formatTokenCount(task.usage.totalTokens)} tokens`);
      }
      break;
  }

  term("\n");
}
