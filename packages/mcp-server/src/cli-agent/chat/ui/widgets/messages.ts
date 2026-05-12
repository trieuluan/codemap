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
import type { Message } from "../store.js";
import { truncate } from "./helpers.js";

function formatTime(ts?: number): string {
  const d = new Date(ts ?? Date.now());
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function renderMessages(
  frame: Frame,
  messages: Message[],
  area: Rect,
): void {
  const visible = messages.filter((m) => m.role !== "welcome");
  const recent = visible.slice(-area.height);

  let y = area.y;
  for (const msg of recent) {
    if (y >= area.y + area.height) break;
    const remaining = area.y + area.height - y;
    const msgArea: Rect = { x: area.x, y, width: area.width, height: remaining };
    const linesUsed = renderOneMessage(frame, msg, msgArea);
    y += linesUsed;
  }
}

function renderOneMessage(frame: Frame, msg: Message, area: Rect): number {
  switch (msg.role) {
    case "tool":
      return renderToolMessage(frame, msg, area);
    case "system":
      return renderSystemMessage(frame, msg, area);
    default:
      return renderUserOrAssistant(frame, msg, area);
  }
}

function renderUserOrAssistant(frame: Frame, msg: Message, area: Rect): number {
  const isUser = msg.role === "user";
  const label = isUser ? "You" : "CodeMap";
  const timeStr = formatTime(msg.timestamp);

  const timeSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);
  const labelSt = styleAddModifier(
    styleFg(createStyle(), isUser ? Color.Green : Color.Cyan),
    Modifier.BOLD,
  );
  const contentRgb = { type: "rgb" as const, r: 229, g: 231, b: 235 };
  const contentSt = styleFg(createStyle(), isUser ? Color.White : contentRgb);

  const content = truncate(msg.content, area.width * 3);
  const lines = content.split("\n");
  let y = area.y;

  for (let i = 0; i < lines.length; i++) {
    if (y >= area.y + area.height) break;
    const line = lines[i]!;

    if (i === 0) {
      const spans = [
        styledSpan(`  ${timeStr} `, timeSt),
        styledSpan(`${label}: `, labelSt),
        styledSpan(line, contentSt),
      ];
      const styledLine = createLine(spans);
      const para = createParagraph("", {});
      const styledPara = {
        ...para,
        text: { lines: [styledLine], style: contentSt, alignment: "left" as const },
      };
      frameRenderWidget(frame, renderParagraph(styledPara), { ...area, y, height: 1 });
    } else {
      // continuation lines — indent to align with content
      const indent = "  ".repeat(1) + " ".repeat(timeStr.length + 2 + label.length + 2);
      const spans = [styledSpan(indent + line, contentSt)];
      const styledLine = createLine(spans);
      const para = createParagraph("", {});
      const styledPara = {
        ...para,
        text: { lines: [styledLine], style: contentSt, alignment: "left" as const },
      };
      frameRenderWidget(frame, renderParagraph(styledPara), { ...area, y, height: 1 });
    }
    y++;
  }

  return Math.min(lines.length, area.y + area.height - area.y);
}

function renderToolMessage(frame: Frame, msg: Message, area: Rect): number {
  const isResult = msg.toolName?.endsWith(" result");
  const timeStr = formatTime(msg.timestamp);
  const timeSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);

  if (isResult) {
    // Dim result line — truncated
    const resultSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);
    const text = truncate(msg.content, area.width - 20);
    const spans = [
      styledSpan(`  ${timeStr} `, timeSt),
      styledSpan("  └ ", resultSt),
      styledSpan(text, resultSt),
    ];
    const line = createLine(spans);
    const para = createParagraph("", {});
    const styledPara = {
      ...para,
      text: { lines: [line], style: resultSt, alignment: "left" as const },
    };
    frameRenderWidget(frame, renderParagraph(styledPara), { ...area, height: 1 });
    return 1;
  }

  // Tool call — show as "▶ Tool: tool_name"
  const toolLabel = msg.toolName || "tool";
  const iconSt = styleFg(createStyle(), Color.Yellow);
  const labelSt = styleAddModifier(styleFg(createStyle(), Color.Yellow), Modifier.BOLD);
  const argsSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);
  const args = truncate(msg.content, Math.max(0, area.width - toolLabel.length - 24));

  const spans = [
    styledSpan(`  ${timeStr} `, timeSt),
    styledSpan("▶ ", iconSt),
    styledSpan(`Tool: ${toolLabel}`, labelSt),
    styledSpan(`  ${args}`, argsSt),
  ];
  const line = createLine(spans);
  const para = createParagraph("", {});
  const styledPara = {
    ...para,
    text: { lines: [line], style: labelSt, alignment: "left" as const },
  };
  frameRenderWidget(frame, renderParagraph(styledPara), { ...area, height: 1 });
  return 1;
}

function renderSystemMessage(frame: Frame, msg: Message, area: Rect): number {
  const lower = msg.content.toLowerCase();
  let fg: Style["fg"] = Color.DarkGray;
  if (lower.startsWith("error") || lower.startsWith("blocked:")) fg = Color.Red;
  else if (lower.startsWith("warning") || lower.startsWith("⚠")) fg = Color.Yellow;
  else if (lower.startsWith("switched") || lower.startsWith("connected")) fg = Color.Green;

  const timeSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);
  const msgSt = styleFg(createStyle(), fg);
  const timeStr = formatTime(msg.timestamp);

  const spans = [
    styledSpan(`  ${timeStr} `, timeSt),
    styledSpan(msg.content, msgSt),
  ];
  const line = createLine(spans);
  const para = createParagraph("", {});
  const styledPara = {
    ...para,
    text: { lines: [line], style: msgSt, alignment: "left" as const },
  };
  frameRenderWidget(frame, renderParagraph(styledPara), { ...area, height: 1 });
  return 1;
}
