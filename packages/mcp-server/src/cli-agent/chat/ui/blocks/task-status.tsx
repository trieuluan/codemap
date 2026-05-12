/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import type { UIState } from "../store.js";
import { Color } from "terminui";
import { Label } from "terminui/jsx";
import { fgStyle, formatElapsed, formatTokenCount, SPINNER_FRAMES } from "./helpers.js";
import type { Style } from "terminui";

export function TaskStatus({ state, spinnerFrame }: { state: UIState; spinnerFrame: number }) {
  const { task } = state;
  if (task.phase === "idle") return null;

  const spinner = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] || SPINNER_FRAMES[0];
  const elapsed = task.startTime ? formatElapsed(Date.now() - task.startTime) : "";

  let phaseText = "";
  let phaseColor: Style["fg"] = Color.Cyan;
  switch (task.phase) {
    case "thinking":
      phaseText = "Thinking...";
      phaseColor = Color.Cyan;
      break;
    case "tool":
      phaseText = `Using ${task.toolName || "tool"}...`;
      phaseColor = Color.Yellow;
      break;
    case "streaming":
      phaseText = "Streaming...";
      phaseColor = Color.Green;
      break;
    case "done":
      phaseText = "Done";
      phaseColor = Color.Green;
      break;
  }

  const toolsInfo = task.toolsCalled > 0 ? `  Tools: ${task.toolsCalled}` : "";
  const usageInfo = task.usage
    ? `  Tokens: ${formatTokenCount(task.usage.promptTokens)}in/${formatTokenCount(task.usage.completionTokens)}out`
    : "";

  return (
    <Label
      style={fgStyle(phaseColor)}
      text={`  ${spinner} ${phaseText}${elapsed ? ` (${elapsed})` : ""}${toolsInfo}${usageInfo}`}
    />
  );
}
