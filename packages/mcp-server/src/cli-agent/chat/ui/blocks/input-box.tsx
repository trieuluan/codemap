/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import type { UIState } from "../store.js";
import { Color } from "terminui";
import { Label, Box } from "terminui/jsx";
import { fgStyle, dimStyle } from "./helpers.js";

export function InputBox({ state }: { state: UIState }) {
  const text = state.inputText;
  const cursor = state.inputCursor;
  const w = state.viewport.width - 6;

  // Build display line with cursor block
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const displayLine = `${before}█${after}`;

  return (
    <Box>
      <Label
        style={dimStyle()}
        text={`  ┌─ Input ${"─".repeat(Math.max(0, w - 9))}┐`}
      />
      <Label
        style={fgStyle(Color.Cyan)}
        text={`  │ > ${displayLine.slice(0, w - 4)}`}
      />
      <Label
        style={dimStyle()}
        text={`  └${"─".repeat(Math.max(0, w - 1))}┘`}
      />
    </Box>
  );
}
