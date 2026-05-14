import { CURSOR_MARKER, type Editor, visibleWidth } from "@earendil-works/pi-tui";
import { C_ACTION, C_ERROR, C_SUCCESS, RESET } from "./theme.js";

export const PROMPT_W = 2;

// Remove the first visible character from a string that may contain ANSI
// escape sequences and CURSOR_MARKER (used to strip the leading "!" in shell
// mode so the prompt glyph and the editor content don't show "!" twice).
export function stripFirstVisibleChar(line: string): string {
  let i = 0;
  while (i < line.length) {
    if (line[i] === CURSOR_MARKER) { i++; continue; }
    if (line.charCodeAt(i) === 0x1b && line[i + 1] === "[") {
      const end = line.indexOf("m", i + 2);
      if (end !== -1) { i = end + 1; continue; }
    }
    return line.slice(0, i) + line.slice(i + 1);
  }
  return line;
}

// Render the editor with a prompt glyph on the cursor line.
// The glyph sits on the same row as the cursor (detected via CURSOR_MARKER),
// not on border lines. Border/non-cursor lines are indented with spaces so
// the editor box corners stay aligned with the prompt-width offset.
export function renderEditor(
  editor: Editor,
  w: number,
  offsetInPanel: number,
  shellMode: boolean,
  debugMode: boolean,
): { lines: string[]; cursorRow: number; cursorCol: number } {
  const promptFirst = shellMode
    ? `${C_SUCCESS}!${RESET} `
    : debugMode
      ? `${C_ERROR}>${RESET} `
      : `${C_ACTION}>${RESET} `;
  const promptCont = " ".repeat(PROMPT_W);

  const lines: string[] = [];
  let cursorRow = -1;
  let cursorCol = 0;

  for (const [i, l] of editor.render(Math.max(8, w - PROMPT_W)).entries()) {
    const markerIdx = l.indexOf(CURSOR_MARKER);
    if (markerIdx >= 0) {
      cursorRow = offsetInPanel + i;
      // In shell mode strip the leading "!" so prompt and content don't both show "!".
      const raw = shellMode ? stripFirstVisibleChar(l) : l;
      const rawMarker = raw.indexOf(CURSOR_MARKER);
      cursorCol = PROMPT_W + (rawMarker >= 0 ? visibleWidth(raw.slice(0, rawMarker)) : 0);
      lines.push(promptFirst + raw.replace(CURSOR_MARKER, ""));
    } else {
      lines.push(promptCont + l);
    }
  }

  return { lines, cursorRow, cursorCol };
}
