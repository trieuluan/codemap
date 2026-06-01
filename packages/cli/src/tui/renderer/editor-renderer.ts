import { CURSOR_MARKER, type Editor } from "@earendil-works/pi-tui";
import { C_ACTION, C_ERROR, C_SUCCESS, RESET } from "../theme.js";

export const PROMPT_W = 2;

// Remove the first visible character from a string that may contain ANSI
// escape sequences (used to strip the leading "!" in shell mode so the prompt
// glyph and the editor content don't show "!" twice).
function stripFirstVisibleChar(line: string): string {
  let i = 0;
  while (i < line.length) {
    // Skip ANSI CSI sequences: ESC [ ... m
    if (line.charCodeAt(i) === 0x1b && line[i + 1] === "[") {
      const end = line.indexOf("m", i + 2);
      if (end !== -1) { i = end + 1; continue; }
    }
    // Skip APC sequences (e.g. CURSOR_MARKER): ESC _ ... BEL
    if (line.charCodeAt(i) === 0x1b && line[i + 1] === "_") {
      const end = line.indexOf("\x07", i + 2);
      if (end !== -1) { i = end + 1; continue; }
    }
    return line.slice(0, i) + line.slice(i + 1);
  }
  return line;
}

// Render the editor with a prompt glyph on the cursor line.
// CURSOR_MARKER is kept in the output — TUI finds it to position the hardware cursor.
export function renderEditor(
  editor: Editor,
  w: number,
  shellMode: boolean,
  debugMode: boolean,
): string[] {
  const promptFirst = shellMode
    ? `${C_SUCCESS}!${RESET} `
    : debugMode
      ? `${C_ERROR}>${RESET} `
      : `${C_ACTION}>${RESET} `;
  const promptCont = " ".repeat(PROMPT_W);

  return editor.render(Math.max(8, w - PROMPT_W)).map((l) => {
    const hasCursor = l.indexOf(CURSOR_MARKER) >= 0;
    if (hasCursor) {
      // In shell mode strip the leading "!" so prompt glyph and content don't both show "!".
      const raw = shellMode ? stripFirstVisibleChar(l) : l;
      return promptFirst + raw;
    }
    return promptCont + l;
  });
}
