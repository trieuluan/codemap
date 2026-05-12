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

// ─── Types ────────────────────────────────────────────

type Span = ReturnType<typeof styledSpan>;
type LineData = Span[];

// ─── Helpers ─────────────────────────────────────────

function formatTime(ts?: number): string {
  const d = new Date(ts ?? Date.now());
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

// ─── Line builders ────────────────────────────────────

function buildAllLines(messages: Message[], width: number): LineData[] {
  const result: LineData[] = [];
  for (const msg of messages) {
    if (msg.role === "welcome") continue;
    appendMsgLines(result, msg, width);
  }
  return result;
}

function appendMsgLines(out: LineData[], msg: Message, width: number): void {
  const timeStr = formatTime(msg.timestamp);
  const timeSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);

  if (msg.role === "user" || msg.role === "assistant") {
    const isUser = msg.role === "user";
    const label = isUser ? "You" : "CodeMap";
    const labelSt = styleAddModifier(
      styleFg(createStyle(), isUser ? Color.Green : Color.Cyan),
      Modifier.BOLD,
    );
    const contentRgb = { type: "rgb" as const, r: 229, g: 231, b: 235 };
    const contentSt = styleFg(createStyle(), isUser ? Color.White : contentRgb);
    const prefixLen = 2 + timeStr.length + 1 + label.length + 2; // "  HH:MM:SS Label: "
    const indent = " ".repeat(prefixLen);

    for (const [i, rawLine] of msg.content.split("\n").entries()) {
      const text = truncate(rawLine, Math.max(1, width - (i === 0 ? prefixLen : prefixLen)));
      if (i === 0) {
        out.push([
          styledSpan(`  ${timeStr} `, timeSt),
          styledSpan(`${label}: `, labelSt),
          styledSpan(text, contentSt),
        ]);
      } else {
        out.push([styledSpan(indent + text, contentSt)]);
      }
    }
    return;
  }

  if (msg.role === "tool") {
    const isResult = msg.toolName?.endsWith(" result");
    if (isResult) {
      const st = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);
      out.push([
        styledSpan(`  ${timeStr} `, timeSt),
        styledSpan("  └ ", st),
        styledSpan(truncate(msg.content, Math.max(1, width - timeStr.length - 12)), st),
      ]);
    } else {
      const iconSt = styleFg(createStyle(), Color.Yellow);
      const lblSt = styleAddModifier(styleFg(createStyle(), Color.Yellow), Modifier.BOLD);
      const argSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);
      out.push([
        styledSpan(`  ${timeStr} `, timeSt),
        styledSpan("▶ ", iconSt),
        styledSpan(`Tool: ${msg.toolName || "tool"}`, lblSt),
        styledSpan(`  ${truncate(msg.content, 100)}`, argSt),
      ]);
    }
    return;
  }

  if (msg.role === "system") {
    const lower = msg.content.toLowerCase();
    let fg: Style["fg"] = Color.DarkGray;
    if (lower.startsWith("error") || lower.startsWith("blocked:")) fg = Color.Red;
    else if (lower.startsWith("warning") || lower.startsWith("⚠")) fg = Color.Yellow;
    else if (lower.startsWith("switched") || lower.startsWith("connected")) fg = Color.Green;

    const msgSt = styleFg(createStyle(), fg);
    const indent = " ".repeat(timeStr.length + 3);

    for (const [i, rawLine] of msg.content.split("\n").entries()) {
      if (i === 0) {
        out.push([styledSpan(`  ${timeStr} `, timeSt), styledSpan(rawLine, msgSt)]);
      } else {
        out.push([styledSpan(`  ${indent}${rawLine}`, msgSt)]);
      }
    }
  }
}

// ─── Line renderer ────────────────────────────────────

function renderLine(frame: Frame, spans: LineData, area: Rect): void {
  const safeSpans = spans.length > 0 ? spans : [styledSpan(" ", createStyle())];
  const line = createLine(safeSpans);
  const para = createParagraph("", {});
  const styledPara = {
    ...para,
    text: { lines: [line], style: createStyle(), alignment: "left" as const },
  };
  frameRenderWidget(frame, renderParagraph(styledPara), { ...area, height: 1 });
}

// ─── Scrollbar ────────────────────────────────────────

function renderScrollbar(
  frame: Frame,
  area: Rect,
  totalLines: number,
  startLine: number,
): void {
  const trackH = area.height;
  if (trackH < 2 || totalLines <= trackH) return;

  const thumbH = Math.max(1, Math.round((trackH * trackH) / totalLines));
  const maxThumbPos = Math.max(0, trackH - thumbH);
  const thumbPos = Math.round((startLine / Math.max(1, totalLines - trackH)) * maxThumbPos);

  const trackSt = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);
  const thumbSt = styleFg(createStyle(), Color.Cyan);
  const scrollX = area.x + area.width - 1;

  for (let i = 0; i < trackH; i++) {
    const isThumb = i >= thumbPos && i < thumbPos + thumbH;
    const line = createLine([styledSpan(isThumb ? "█" : "│", isThumb ? thumbSt : trackSt)]);
    const para = createParagraph("", {});
    const styledPara = {
      ...para,
      text: { lines: [line], style: createStyle(), alignment: "left" as const },
    };
    frameRenderWidget(frame, renderParagraph(styledPara), {
      x: scrollX,
      y: area.y + i,
      width: 1,
      height: 1,
    });
  }
}

// ─── Main export ─────────────────────────────────────

export function renderMessages(
  frame: Frame,
  messages: Message[],
  area: Rect,
  scrollOffset = 0,
): void {
  const allLines = buildAllLines(messages, area.width);
  const totalLines = allLines.length;
  if (totalLines === 0) return;

  const needsScrollbar = totalLines > area.height;
  const contentW = needsScrollbar ? area.width - 1 : area.width;
  const maxOffset = Math.max(0, totalLines - area.height);
  const offset = Math.min(scrollOffset, maxOffset);
  const startLine = Math.max(0, totalLines - area.height - offset);
  const visibleLines = allLines.slice(startLine, startLine + area.height);

  for (let i = 0; i < visibleLines.length; i++) {
    renderLine(frame, visibleLines[i]!, {
      x: area.x,
      y: area.y + i,
      width: contentW,
      height: 1,
    });
  }

  if (needsScrollbar) {
    renderScrollbar(frame, area, totalLines, startLine);
  }
}
