import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import type { UIState } from "../store.js";

const MAX_VISIBLE_LINES = 30;

export function renderSubprocessLog(term: Terminal, state: UIState): void {
  const { subprocess } = state;
  if (!subprocess.active && subprocess.logLines.length === 0) return;

  const width = state.viewport.width;
  const boxW = Math.min(width - 4, 76);
  const innerW = boxW - 2;
  const sp = "  ";
  const hLine = "─".repeat(innerW);
  const cmdLabel = subprocess.command;

  term("\n");
  term(sp);
  term.dim.gray("┌─┤ ");
  term.yellow(cmdLabel);
  term.dim.gray(" ├" + hLine.slice(cmdLabel.length + 4) + "┐");
  term("\n");

  const lines = subprocess.logLines.slice(-MAX_VISIBLE_LINES);
  for (const line of lines) {
    term(sp);
    term.dim.gray("│ ");
    term.dim.gray(line.slice(0, innerW - 2));
    term("\n");
  }

  if (subprocess.logLines.length > MAX_VISIBLE_LINES) {
    term(sp);
    term.dim.gray("│ ");
    term.dim.gray(`... ${subprocess.logLines.length - MAX_VISIBLE_LINES} more lines`);
    term("\n");
  }

  if (subprocess.active) {
    term(sp);
    term.dim.gray("│ ");
    term.cyan("⟳ running...");
    term("\n");
  }

  term(sp);
  term.dim.gray("└" + hLine + "┘");
  term("\n");
}
