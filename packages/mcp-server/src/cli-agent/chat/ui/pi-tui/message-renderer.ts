import cfonts from "cfonts";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Message, UIState } from "../store.js";
import { formatTime, gradientStr, truncate } from "../ink-utils.js";
import {
  BG_USER,
  BOLD,
  C_ACTION,
  C_AI,
  C_ARCH,
  C_GRAY,
  C_MUTED,
  C_WARNING,
  C_WHITE,
  RESET,
} from "./theme.js";
import { padToWidth, renderMarkdownish, stripAnsi, wrapPlain } from "./text.js";
import { highlightBlock } from "./shiki-highlight.js";
import { normalizeHtml } from "../../html-utils.js";

/**
 * Format expanded tool result content.
 * If the content is JSON with summary/data or structuredContent.summary/data,
 * render summary as markdown and data as highlighted JSON.
 */
function formatExpandedContent(content: string, width: number): string[] {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const structured =
        record.structuredContent &&
        typeof record.structuredContent === "object" &&
        !Array.isArray(record.structuredContent)
          ? (record.structuredContent as Record<string, unknown>)
          : record;
      const summary = structured.summary;
      const data = structured.data;
      const lines: string[] = [];

      if (summary && typeof summary === "string") {
        const summaryLines = renderMarkdownish(summary, width);
        lines.push(...summaryLines);
        lines.push("");
      }

      if (data !== undefined) {
        const jsonStr = JSON.stringify(data, null, 2);
        const highlighted = highlightBlock(jsonStr, "json");
        lines.push(...highlighted);
      }

      return lines.length > 0 ? lines : renderMarkdownish(content, width);
    }
  } catch {
    // Not JSON or parsing failed — fall through
  }
  // Default: render as markdown
  return renderMarkdownish(content, width);
}

function generateBanner(): string[] {
  const result = cfonts.render("CODEMAP", {
    font: "simple3d",
    gradient: ["cyan", "magenta"],
    env: "node",
  });
  const raw = (result as { string?: string }).string ?? "";
  const lines = raw.split("\n");
  let start = 0;
  let end = lines.length - 1;
  while (start <= end && stripAnsi(lines[start] ?? "").trim() === "") start++;
  while (end >= start && stripAnsi(lines[end] ?? "").trim() === "") end--;
  return lines.slice(start, end + 1);
}

const BANNER_LINES = generateBanner();

function toolResultLineLimit(content: string): number {
  const lower = content.toLowerCase();
  if (
    lower.includes("```diff") ||
    lower.includes("@@ -") ||
    lower.includes("diff")
  ) {
    return 120;
  }
  return 6;
}

export function headerLines(state: UIState): string[] {
  const workspace = state.workspace?.repoName ?? state.config.profile;
  if (state.messages.length > 0) {
    return [
      `${C_ACTION}${BOLD}codemap${RESET} ${C_GRAY}${workspace}${RESET} ${C_MUTED}|${RESET} ${C_WHITE}${truncate(state.config.model, 28)}${RESET} ${C_MUTED}|${RESET} ${C_ACTION}MCP connected${RESET}`,
      `${C_MUTED}${"-".repeat(72)}${RESET}`,
    ];
  }
  return [
    "",
    ...BANNER_LINES,
    gradientStr(
      "  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM",
      { r: 88, g: 213, b: 247 },
      { r: 244, g: 114, b: 182 },
      false,
    ),
    "",
    [
      `${C_ARCH}o${RESET} ${C_WHITE}v0.1.0${RESET}`,
      `${C_ACTION}@${RESET} ${C_WHITE}${truncate(workspace, 20)}${RESET}`,
      `${C_AI}*${RESET} ${C_WHITE}${truncate(state.config.model, 28)}${RESET}`,
      `${C_ACTION}#${RESET} ${C_ACTION}Connected${RESET}`,
    ]
      .join(`  ${C_MUTED}|${RESET}  `)
      .padStart(2),
    `  ${C_ACTION}${BOLD}> Quick Start:${RESET} ${C_GRAY}/help for commands  .  @ for files  .  Tab for suggestions  .  Ctrl+C cancel${RESET}`,
    "",
  ];
}

// Replace inline base64 image data with a short placeholder before rendering.
function stripBase64Images(text: string): string {
  return text.replace(
    /!\[([^\]]*)\]\(data:image\/[^;]+;base64,[a-zA-Z0-9+/=\s]+\)/g,
    (_match, alt) => `[image${alt ? `: ${alt}` : ""}]`,
  );
}

// Safe wrapper: if renderMarkdownish throws (e.g. broken markdown from a
// truncated tool result), fall back to plain line-split to avoid crashing doRefresh.
function safeRender(
  content: string,
  width: number,
  opts?: { noHighlight?: boolean },
): string[] {
  const cleaned = normalizeHtml(stripBase64Images(content));
  let lines: string[];
  try {
    lines = renderMarkdownish(cleaned, width, opts);
  } catch {
    lines = cleaned.split("\n").flatMap((l) => wrapPlain(l, width));
  }
  // Clamp lines that exceed width (markdown tables don't always respect the width constraint)
  return lines.map((line) =>
    visibleWidth(line) > width ? truncateToWidth(line, width) : line,
  );
}

export function messageLines(
  messages: Message[],
  width: number,
  frame = 0,
): string[] {
  return renderMessageLines(messages, width);
}

function renderMessageLines(
  messages: Message[],
  width: number,
): string[] {
  if (messages.length === 0) {
    return [
      `${C_ACTION}${BOLD}Welcome to CodeMap Agent${RESET}`,
      `${C_GRAY}Ask a question, mention files with @, or type /help.${RESET}`,
      "",
    ];
  }

  const out: string[] = [];
  for (const msg of messages) {
    const time = `${C_MUTED}${formatTime(msg.timestamp)}${RESET}`;
    if (msg.role === "user") {
      const bg = (raw: string) =>
        BG_USER +
        padToWidth(raw, width).replace(/\x1b\[0m/g, `\x1b[0m${BG_USER}`) +
        RESET;
      const prefixW = 11;
      const bodyW = Math.max(20, width - prefixW - 2);
      const lines = safeRender(msg.content, bodyW);
      out.push(bg(`${time} ${C_ACTION}>${RESET} ${lines[0] ?? ""}`));
      for (const line of lines.slice(1))
        out.push(bg(`${" ".repeat(prefixW)}${line}`));
    } else if (msg.role === "assistant") {
      if (!msg.content?.trim()) continue;
      const prefixW = 9;
      const bodyW = Math.max(20, width - prefixW);
      const lines = safeRender(stripAnsi(msg.content), bodyW);
      out.push(`${time} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1))
        out.push(`${" ".repeat(prefixW)}${line}`);
    } else if (msg.role === "tool_call") {
      const toolName = truncate(msg.name ?? "tool", 20);
      const isPlan = (msg.name ?? "").toLowerCase() === "plan";
      const toolColor = isPlan ? C_AI : C_WARNING;
      const prefixW = 9;
      const bodyW = Math.max(20, width - prefixW);
      const expandIcon = msg.expanded ? "↓" : "→";
      const rawContent = stripAnsi(msg.content);
      const hasResult = (msg.toolResults?.length ?? 0) > 0;
      const suffix = hasResult || msg.expandedContent ? " (Ctrl+O to expand)" : "";

      const lines = safeRender(rawContent, bodyW);
      out.push(
        `${time} ${toolColor}${expandIcon}${RESET} ${toolColor}${toolName}:${RESET} ${lines[0] ?? ""}${C_MUTED}${suffix}${RESET}`,
      );
      for (const line of lines.slice(1))
        out.push(`${" ".repeat(prefixW)}${toolColor}  ${line}${RESET}`);

      for (const result of msg.toolResults ?? []) {
        const resultName = truncate(result.name, 20);
        const resultPrefixW = Math.min(11 + resultName.length, 34);
        const resultW = Math.max(20, width - resultPrefixW);
        const rawLines = safeRender(stripAnsi(result.content), resultW, {
          noHighlight: true,
        });
        const limit = toolResultLineLimit(result.content);
        const resultLines =
          rawLines.length > limit
            ? [
                ...rawLines.slice(0, limit),
                `${C_MUTED}... ${rawLines.length - limit} more lines${RESET}`,
              ]
            : rawLines;
        const status = result.success ? "✓" : "✗";
        out.push(
          `${" ".repeat(prefixW)}${C_MUTED}${status} ${resultName}:${RESET} ${C_GRAY}${resultLines[0] ?? ""}${RESET}`,
        );
        for (const line of resultLines.slice(1))
          out.push(`${" ".repeat(resultPrefixW)}${C_GRAY}${line}${RESET}`);
      }

      if (msg.expanded && msg.expandedContent) {
        const expandedLines = formatExpandedContent(stripAnsi(msg.expandedContent), bodyW);
        out.push(
          `${" ".repeat(prefixW)}${C_MUTED}${"─".repeat(Math.min(bodyW, 60))}${RESET}`,
        );
        for (const line of expandedLines)
          out.push(`${" ".repeat(prefixW)}${C_GRAY}${line}${RESET}`);
        out.push(
          `${" ".repeat(prefixW)}${C_MUTED}${"─".repeat(Math.min(bodyW, 60))}${RESET}`,
        );
      }
    } else if (msg.role === "system") {
      const prefixW = 17;
      const bodyW = Math.max(20, width - prefixW);
      const lines = safeRender(msg.content, bodyW);
      out.push(`${time} ${C_MUTED}system:${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1))
        out.push(`${" ".repeat(prefixW)}${line}`);
    } else {
      out.push(...safeRender(msg.content, width));
    }
    out.push("");
  }
  return out;
}

export { wrapPlain };
