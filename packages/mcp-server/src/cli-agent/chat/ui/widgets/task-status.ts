import {
  createParagraph,
  createStyle,
  styleFg,
  styleAddModifier,
  Modifier,
  Color,
  frameRenderWidget,
  renderParagraph,
  styledSpan,
  createLine,
} from "terminui";
import type { Frame, Rect, Style } from "terminui";
import type { UIState } from "../store.js";
import { SPINNER_FRAMES, formatElapsed, formatTokenCount } from "./helpers.js";

export function renderTaskStatus(
  frame: Frame,
  state: UIState,
  spinnerFrame: number,
  area: Rect,
): void {
  const { task } = state;
  if (task.phase === "idle") return;

  const spinner = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] || SPINNER_FRAMES[0]!;
  const elapsed = task.startTime ? formatElapsed(Date.now() - task.startTime) : "";

  let icon = spinner;
  let phaseText = "";
  let iconFg: Style["fg"] = Color.Cyan;
  let textFg: Style["fg"] = Color.Cyan;

  switch (task.phase) {
    case "thinking":
      icon = spinner;
      phaseText = "Thinking";
      iconFg = Color.Cyan;
      textFg = Color.Cyan;
      break;
    case "tool":
      icon = "▶";
      phaseText = `Tool: ${task.toolName || "tool"}`;
      iconFg = Color.Yellow;
      textFg = Color.Yellow;
      break;
    case "streaming":
      icon = spinner;
      phaseText = "Streaming";
      iconFg = Color.Green;
      textFg = Color.Green;
      break;
    case "done":
      icon = "✓";
      phaseText = "Done";
      iconFg = Color.Green;
      textFg = Color.Green;
      break;
  }

  const toolsInfo = task.toolsCalled > 0
    ? `  · ${task.toolsCalled} tool${task.toolsCalled > 1 ? "s" : ""}`
    : "";
  const usageInfo = task.usage
    ? `  · ${formatTokenCount(task.usage.promptTokens + task.usage.completionTokens)} tokens`
    : "";
  const elapsedInfo = elapsed ? `  (${elapsed})` : "";

  const iconSt = styleAddModifier(styleFg(createStyle(), iconFg), Modifier.BOLD);
  const textSt = styleFg(createStyle(), textFg);
  const dimSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);

  const spans = [
    styledSpan("  ", dimSt),
    styledSpan(icon, iconSt),
    styledSpan(`  ${phaseText}`, textSt),
    styledSpan(`${elapsedInfo}${toolsInfo}${usageInfo}`, dimSt),
  ];

  const line = createLine(spans);
  const para = createParagraph("", {});
  const styledPara = {
    ...para,
    text: { lines: [line], style: textSt, alignment: "left" as const },
  };
  frameRenderWidget(frame, renderParagraph(styledPara), { ...area, height: 1 });
}
