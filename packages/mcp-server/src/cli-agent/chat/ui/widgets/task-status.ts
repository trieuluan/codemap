import {
  createParagraph,
  createStyle,
  styleFg,
  Color,
  frameRenderWidget,
  renderParagraph,
} from "terminui";
import type { Frame, Rect, Style } from "terminui";
import type { UIState } from "../store.js";
import { SPINNER_FRAMES, formatElapsed, formatTokenCount } from "./helpers.js";

/**
 * Widget-based task status line.
 * Shows spinner + phase + elapsed time + tokens during agent execution.
 */
export function renderTaskStatus(
  frame: Frame,
  state: UIState,
  spinnerFrame: number,
  area: Rect,
): void {
  const { task } = state;
  if (task.phase === "idle") return;

  const spinner = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] || SPINNER_FRAMES[0];
  const elapsed = task.startTime ? formatElapsed(Date.now() - task.startTime) : "";

  let phaseText = "";
  let fg: Style["fg"] = Color.Cyan;
  switch (task.phase) {
    case "thinking":
      phaseText = "Thinking...";
      fg = Color.Cyan;
      break;
    case "tool":
      phaseText = `Using ${task.toolName || "tool"}...`;
      fg = Color.Yellow;
      break;
    case "streaming":
      phaseText = "Streaming...";
      fg = Color.Green;
      break;
    case "done":
      phaseText = "Done";
      fg = Color.Green;
      break;
  }

  const toolsInfo = task.toolsCalled > 0 ? `  Tools: ${task.toolsCalled}` : "";
  const usageInfo = task.usage
    ? `  Tokens: ${formatTokenCount(task.usage.promptTokens)}in/${formatTokenCount(task.usage.completionTokens)}out`
    : "";

  const text = `  ${spinner} ${phaseText}${elapsed ? ` (${elapsed})` : ""}${toolsInfo}${usageInfo}`;
  const style = styleFg(createStyle(), fg);
  const para = createParagraph(text, { style });
  frameRenderWidget(frame, renderParagraph(para), { ...area, height: 1 });
}
