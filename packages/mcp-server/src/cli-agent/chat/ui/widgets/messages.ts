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

/**
 * Widget-based message renderer.
 * Uses frameRenderWidget + renderParagraph for each message —
 * direct buffer writes, no JSX overhead.
 */
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
  const prefix = `${label}: `;
  const content = truncate(msg.content, area.width * 2);

  const baseStyle = isUser ? styleFg(createStyle(), Color.Green) : createStyle();
  const prefixStyle = styleAddModifier(baseStyle, Modifier.BOLD);
  const contentStyle = baseStyle;

  const lines = content.split("\n");
  let y = area.y;

  for (const line of lines) {
    if (y >= area.y + area.height) break;
    const para = createParagraph("", { style: contentStyle });
    // Build styled line with bold prefix + normal content
    const styledLine = createLine([
      styledSpan(`  ${prefix}`, prefixStyle),
      styledSpan(line, contentStyle),
    ]);
    const styledPara = { ...para, text: { lines: [styledLine], style: contentStyle, alignment: "left" as const } };
    frameRenderWidget(frame, renderParagraph(styledPara), { ...area, y, height: 1 });
    y++;
  }

  return Math.min(lines.length, area.y + area.height - (area.y));
}

function renderToolMessage(frame: Frame, msg: Message, area: Rect): number {
  const isResult = msg.toolName?.endsWith(" result");
  const fg = isResult ? Color.DarkGray : Color.Yellow;
  const label = msg.toolName || "tool";
  const content = isResult
    ? `    ${label}: ${truncate(msg.content, 200)}`
    : `  ${label}(${truncate(msg.content, 150)})`;

  const style = styleFg(createStyle(), fg);
  const para = createParagraph(content, { style });
  frameRenderWidget(frame, renderParagraph(para), { ...area, height: 1 });
  return 1;
}

function renderSystemMessage(frame: Frame, msg: Message, area: Rect): number {
  const lower = msg.content.toLowerCase();
  let fg: Style["fg"] = Color.DarkGray;
  if (lower.startsWith("error") || lower.startsWith("blocked:")) fg = Color.Red;
  else if (lower.startsWith("warning") || lower.startsWith("⚠")) fg = Color.Yellow;
  else if (lower.startsWith("switched") || lower.startsWith("connected")) fg = Color.Green;

  const style = styleFg(createStyle(), fg);
  const para = createParagraph(`  ${msg.content}`, { style });
  frameRenderWidget(frame, renderParagraph(para), { ...area, height: 1 });
  return 1;
}
