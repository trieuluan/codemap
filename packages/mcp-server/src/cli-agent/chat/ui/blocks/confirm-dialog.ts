import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import type { UIState } from "../store.js";

export function renderConfirmDialog(term: Terminal, state: UIState): void {
  const { confirm } = state;
  if (!confirm.active) return;

  const width = state.viewport.width;
  const boxW = Math.min(width - 4, 60);
  const innerW = boxW - 2;
  const sp = "  ";
  const hLine = "─".repeat(innerW);

  term("\n");
  term(sp);
  term.dim.yellow("┌─┤ ");
  term.yellow.bold(confirm.toolName);
  term.dim.yellow(" ├" + hLine.slice(confirm.toolName.length + 4) + "┐");
  term("\n");

  term(sp);
  term.dim.yellow("│ ");
  term.white("wants to edit files");
  const padR = innerW - 2 - "wants to edit files".length;
  if (padR > 0) term(" ".repeat(padR));
  term.dim.yellow("│");
  term("\n");

  if (confirm.preview) {
    const lines = confirm.preview.split("\n").slice(0, 15);
    for (const line of lines) {
      const trimmed = line.slice(0, innerW - 4);
      term(sp);
      term.dim.yellow("│ ");
      if (trimmed.startsWith("+")) {
        term.green(trimmed);
      } else if (trimmed.startsWith("-")) {
        term.red(trimmed);
      } else {
        term.dim.gray(trimmed);
      }
      const pad = innerW - 2 - trimmed.length;
      if (pad > 0) term(" ".repeat(pad));
      term.dim.yellow("│");
      term("\n");
    }
  }

  // Actions row
  term(sp);
  term.dim.yellow("│ ");
  term.bold.green("y");
  term.gray("es  ");
  term.bold.red("n");
  term.gray("o  ");
  term.bold.cyan("a");
  term.gray("ll (accept all)");
  const actionLen = "yes  no  all (accept all)".length;
  const padR2 = innerW - 2 - actionLen;
  if (padR2 > 0) term(" ".repeat(padR2));
  term.dim.yellow("│");
  term("\n");

  term(sp);
  term.dim.yellow("└" + hLine + "┘");
  term("\n");
}
