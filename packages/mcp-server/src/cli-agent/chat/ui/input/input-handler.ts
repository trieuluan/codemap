import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import { buildAutoComplete } from "./autocomplete.js";

export interface InputHandlerOptions {
  term: Terminal;
  width: number;
  inputHistory?: string[];
  onAbort?: () => void;
}

/**
 * Read a line with a bordered input box and @mention autocomplete.
 * Returns the submitted text, or null if aborted (Ctrl+C on empty).
 */
export async function readLine(opts: InputHandlerOptions): Promise<string | null> {
  const { term, width, inputHistory = [], onAbort } = opts;

  const boxW = Math.min(width - 4, 76);
  const innerW = boxW - 2;

  // Top border
  term("\n  ");
  const hLine = "─".repeat(innerW - 8);
  term.dim.gray("┌─ Input ─" + hLine + "┐");
  term("\n");

  // Input line with left border
  term("  ");
  term.dim.gray("│ ");
  term.bold.cyan("> ");

  return new Promise<string | null>((resolve) => {
    const history = [...inputHistory];

    term.inputField(
      {
        history,
        autoComplete: buildAutoComplete(),
        autoCompleteMenu: true,
        autoCompleteHint: true,
        cancelable: true,
        echo: true,
      },
      (err, input) => {
        // Bottom border (drawn after input completes)
        term("\n");
        const hLineBottom = "─".repeat(innerW);
        term("  ");
        term.dim.gray("└" + hLineBottom + "┘");
        term("\n");

        if (err) {
          resolve(null);
          return;
        }
        if (input == null) {
          onAbort?.();
          resolve(null);
          return;
        }
        const trimmed = input.trim();
        if (!trimmed) {
          resolve(null);
          return;
        }
        resolve(trimmed);
      },
    );
  });
}
