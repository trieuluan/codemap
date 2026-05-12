import { Box, Text, useStdout } from "ink";
import type { UIState } from "../store.js";
import type { Message } from "../store.js";
import {
  gradientStr,
  truncate,
  formatTime,
  fg,
  BOLD,
  DIM,
  RESET,
} from "../ink-utils.js";
import { getModeDisplay } from "../../commands/route-policy.js";
import cfonts from "cfonts";

// ─── Banner ───────────────────────────────────────────────

function generateBanner(): string[] {
  const result = cfonts.render("CODEMAP", {
    font: "simple3d",
    gradient: ["cyan", "magenta"],
    env: "node",
  });
  const raw: string = (result as { string: string }).string ?? "";
  const lines = raw.split("\n");
  let start = 0, end = lines.length - 1;
  while (start <= end && (lines[start] ?? "").replace(/\x1b\[[0-9;]*m/g, "").trim() === "") start++;
  while (end >= start && (lines[end] ?? "").replace(/\x1b\[[0-9;]*m/g, "").trim() === "") end--;
  return lines.slice(start, end + 1);
}

const BANNER_LINES = generateBanner();

// ─── Colors ───────────────────────────────────────────────

const C_CYAN  = `${BOLD}${fg(0, 229, 255)}`;
const C_GRAY  = fg(107, 114, 128);
const C_WHITE = fg(229, 231, 235);
const C_GREEN = fg(34, 197, 94);

// ─── Header lines (ASCII-only, no box-drawing chars) ──────

function buildHeaderLines(state: UIState): string[] {
  const modeInfo = getModeDisplay(state.config.mode);
  const workspace = state.workspace?.repoName ?? state.config.profile;
  const lines: string[] = [];

  lines.push("");
  for (const bline of BANNER_LINES) lines.push(bline);

  lines.push(
    gradientStr(
      "  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM",
      { r: 34, g: 211, b: 238 },
      { r: 168, g: 85, b: 247 },
      false,
    ),
  );
  lines.push("");

  const pills = [
    `${C_CYAN}o${RESET} ${C_WHITE}v0.1.0${RESET}`,
    `${C_CYAN}@${RESET} ${C_WHITE}${truncate(workspace, 20)}${RESET}`,
    `${C_CYAN}*${RESET} ${C_WHITE}${truncate(state.config.model, 24)}${RESET}`,
    `${C_CYAN}~${RESET} ${C_GREEN}${modeInfo.label}${RESET}`,
    `${C_CYAN}#${RESET} ${C_CYAN}Connected${RESET}`,
  ];
  lines.push("  " + pills.join(`  ${C_GRAY}|${RESET}  `));
  lines.push(
    `  ${C_CYAN}${BOLD}> Quick Start:${RESET} ` +
    `${C_GRAY}/help for commands  .  @ for files  .  Tab for suggestions  .  Ctrl+C cancel${RESET}`,
  );
  lines.push("");
  lines.push(`  ${C_GRAY}${"-".repeat(50)}${RESET}`);
  lines.push("");

  return lines;
}

// ─── Message lines ────────────────────────────────────────

function wrapText(text: string, width: number): string[] {
  const maxWidth = Math.max(1, width);
  if (text.length <= maxWidth) return [text];

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > maxWidth) {
    let splitAt = remaining.lastIndexOf(" ", maxWidth);
    if (splitAt <= 0) splitAt = maxWidth;

    lines.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  lines.push(remaining);
  return lines;
}

function buildMessageLines(messages: Message[], width: number): string[] {
  const result: string[] = [];
  for (const msg of messages) {
    if (msg.role === "welcome") continue;
    appendMsgLines(result, msg, width);
  }
  return result;
}

function appendMsgLines(out: string[], msg: Message, width: number): void {
  const timeStr = formatTime(msg.timestamp);
  const timePrefix = `${DIM}${C_GRAY}  ${timeStr} ${RESET}`;

  if (msg.role === "user" || msg.role === "assistant") {
    const isUser = msg.role === "user";
    const label = isUser ? "You" : "CodeMap";
    const labelAnsi = isUser
      ? `${BOLD}${fg(34, 197, 94)}${label}: ${RESET}`
      : `${BOLD}${fg(0, 229, 255)}${label}: ${RESET}`;
    const contentColor = fg(229, 231, 235);
    const indentLen = 2 + timeStr.length + 1 + label.length + 2;
    const indent = " ".repeat(indentLen);
    for (const [i, rawLine] of msg.content.split("\n").entries()) {
      const firstPrefix = i === 0 ? `${timePrefix}${labelAnsi}` : indent;
      const firstWidth = width - indentLen;
      for (const [j, wrapped] of wrapText(rawLine, firstWidth).entries()) {
        const prefix = j === 0 ? firstPrefix : indent;
        out.push(`${prefix}${contentColor}${wrapped}${RESET}`);
      }
    }
    return;
  }

  if (msg.role === "tool") {
    const isResult = msg.toolName?.endsWith(" result");
    if (isResult) {
      out.push(`${timePrefix}${DIM}${C_GRAY}  \\ ${truncate(msg.content, 200)}${RESET}`);
    } else {
      out.push(
        `${timePrefix}${BOLD}${fg(234, 179, 8)}> ` +
        `Tool: ${msg.toolName ?? "tool"}${RESET}` +
        `${DIM}${C_GRAY}  ${truncate(msg.content, 100)}${RESET}`,
      );
    }
    return;
  }

  if (msg.role === "system") {
    const lower = msg.content.toLowerCase();
    let color = C_GRAY;
    if (lower.startsWith("error") || lower.startsWith("blocked:")) color = fg(239, 68, 68);
    else if (lower.startsWith("warning") || lower.startsWith("⚠")) color = fg(234, 179, 8);
    else if (lower.startsWith("switched") || lower.startsWith("connected")) color = fg(34, 197, 94);
    const indent = " ".repeat(timeStr.length + 3);
    for (const [i, rawLine] of msg.content.split("\n").entries()) {
      const prefix = i === 0 ? timePrefix : `  ${indent}`;
      const wrapWidth = width - (i === 0 ? timeStr.length + 3 : indent.length + 2);
      for (const [j, wrapped] of wrapText(rawLine, wrapWidth).entries()) {
        out.push(`${j === 0 ? prefix : `  ${indent}`}${color}${wrapped}${RESET}`);
      }
    }
  }
}

// ─── Scrollbar (ASCII-safe: # and |) ─────────────────────

function Scrollbar({ total, start, height }: { total: number; start: number; height: number }) {
  if (total <= height) return null;
  const thumbH = Math.max(1, Math.round((height * height) / total));
  const maxPos = Math.max(0, height - thumbH);
  const thumbPos = Math.round((start / Math.max(1, total - height)) * maxPos);
  return (
    <Box flexDirection="column">
      {Array.from({ length: height }, (_, i) => {
        const isThumb = i >= thumbPos && i < thumbPos + thumbH;
        return (
          <Text key={i} color={isThumb ? "cyan" : undefined} dimColor={!isThumb}>
            {isThumb ? "#" : "|"}
          </Text>
        );
      })}
    </Box>
  );
}

// ─── Content component ────────────────────────────────────
// Renders exactly `height` lines — no height-constrained Box wrapper.
// Long messages are wrapped before slicing so scroll operates on visible rows.
// Virtual scroll controlled by state.messageScroll.offset.

export function Content({ state, height }: { state: UIState; height: number }) {
  const { stdout } = useStdout();
  const contentWidth = Math.max(20, (stdout.columns || state.viewport.width || 80) - 1);
  const headerLines = buildHeaderLines(state);
  const msgLines    = buildMessageLines(state.messages, contentWidth);
  const allLines    = [...headerLines, ...msgLines];
  const total       = allLines.length;

  const maxOffset = Math.max(0, total - height);
  const offset    = Math.min(state.messageScroll.offset, maxOffset);
  const startLine = Math.max(0, total - height - offset);

  // Slice to exactly `height` lines; pad with blanks if not enough content yet
  const raw = allLines.slice(startLine, startLine + height);
  while (raw.length < height) raw.push("");

  const needsScrollbar = total > height;

  // Render as flat Text rows — no Box height constraint needed because we
  // emit exactly `height` Text elements (each = 1 terminal row).
  return (
    <Box flexDirection="row">
      <Box flexDirection="column" flexGrow={1}>
        {raw.map((line, i) => (
          <Text key={i} wrap="truncate">{line}</Text>
        ))}
      </Box>
      {needsScrollbar && (
        <Scrollbar total={total} start={startLine} height={height} />
      )}
    </Box>
  );
}
