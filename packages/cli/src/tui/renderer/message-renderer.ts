import cfonts from "cfonts";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Message, UIState } from "../../chat/state/store.js";
import { formatTime, gradientStr, truncate } from "./ink-utils.js";
import {
  BG_USER,
  BOLD,
  C_ACTION,
  C_AI,
  C_ARCH,
  C_ERROR,
  C_GRAY,
  C_MUTED,
  C_SUCCESS,
  C_WARNING,
  C_WHITE,
  RESET,
  SPINNER,
} from "../theme.js";
import { padToWidth, renderMarkdownish, stripAnsi, truncateVisible, wrapPlain } from "../text/text.js";
import { highlightBlock } from "./shiki-highlight.js";
import { normalizeHtml } from "../../agent/core/html-utils.js";

/**
 * Format expanded tool result content.
 * If the content is JSON with summary/data or structuredContent.summary/data,
 * render summary as markdown. Raw structured data is shown only in debug mode
 * or when the tool result explicitly requested verbose/debug output.
 */
function formatExpandedContent(
  content: string,
  width: number,
  opts: { showRawData?: boolean } = {},
): string[] {
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
      const error = structured.error;
      const lines: string[] = [];

      if (typeof summary === "string" && (data !== undefined || error !== undefined)) {
        const summaryLines = renderMarkdownish(summary, width);
        lines.push(...summaryLines);
        const raw = data !== undefined ? data : error;
        const verbosity = getToolResultVerbosity(structured, raw);
        const showRaw =
          opts.showRawData || verbosity === "verbose" || verbosity === "debug";
        if (showRaw) {
          lines.push("");
          lines.push(`${C_MUTED}Raw data${RESET}`);
          const jsonStr = JSON.stringify(raw, null, 2);
          const highlighted = highlightBlock(jsonStr, "json");
          const codeWidth = Math.max(8, width - 4);
          for (const line of highlighted) {
            lines.push(...wrapPlain(line, codeWidth));
          }
        }
        return lines;
      }
    }
  } catch {
    // Not JSON or parsing failed — fall through
  }
  // Default: render as markdown
  return renderMarkdownish(content, width);
}

function getToolResultVerbosity(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const direct = record.verbosity;
    if (typeof direct === "string") return direct;
    if (record.verbose === true) return "verbose";
    const meta = record.meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const metaVerbosity = (meta as Record<string, unknown>).verbosity;
      if (typeof metaVerbosity === "string") return metaVerbosity;
    }
  }
  return undefined;
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

function renderPreviewLines(preview: string, bodyW: number, prefixW: number): string[] {
  const normalized = preview.replace(/^~~~([^\n]*)/gm, "```$1").replace(/^~~~$/gm, "```");
  const body = normalized.split("\n").filter((line) => !line.startsWith("File:"));
  const added = body.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = body.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  const sourceLines = body.filter(
    (line) =>
      line.trim() !== "" &&
      !line.startsWith("```") &&
      !line.startsWith("---") &&
      !line.startsWith("+++"),
  ).length;
  const summary =
    added > 0 || removed > 0
      ? `+${added} -${removed} lines`
      : `${sourceLines} line${sourceLines === 1 ? "" : "s"}`;

  const previewIndentW = 3;
  const renderW = Math.max(20, bodyW - previewIndentW);
  const rendered = renderMarkdownish(normalized, renderW);
  const indent = " ".repeat(prefixW);
  const fitPreviewLine = (line: string) =>
    truncateVisible(`${indent}${line}`, prefixW + bodyW, true);
  const out = [fitPreviewLine(`${C_MUTED}⎿  ${summary}${RESET}`)];
  out.push(...rendered.map((line) => fitPreviewLine(`${" ".repeat(previewIndentW)}${line}`)));
  return out;
}

export function headerLines(state: UIState): string[] {
  const workspace = state.workspace?.repoName ?? state.config.model;
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
  opts: { showRawToolData?: boolean; suppressFirstTimestamp?: boolean } = {},
): string[] {
  return renderMessageLines(messages, width, frame, opts);
}

function renderMessageLines(
  messages: Message[],
  width: number,
  frame = 0,
  opts: { showRawToolData?: boolean; suppressFirstTimestamp?: boolean } = {},
): string[] {
  if (messages.length === 0) {
    return [
      `${C_ACTION}${BOLD}Welcome to CodeMap Agent${RESET}`,
      `${C_GRAY}Ask a question, mention files with @, or type /help.${RESET}`,
      "",
    ];
  }

  const out: string[] = [];
  let lastRenderedTime: string | undefined;
  for (const [idx, msg] of messages.entries()) {
    const timeText = formatTime(msg.timestamp);
    const shouldSuppressTime =
      timeText === lastRenderedTime || (idx === 0 && opts.suppressFirstTimestamp);
    const time = shouldSuppressTime
      ? " ".repeat(timeText.length)
      : `${C_MUTED}${timeText}${RESET}`;
    lastRenderedTime = timeText;
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
      const prefixW = 9;
      const bodyW = Math.max(20, width - prefixW);
      const rawContent = msg.content;  // preserve ANSI colors in completion marker
      const hasResult = (msg.toolResults?.length ?? 0) > 0;
      const hasFailed = (msg.toolResults ?? []).some((r) => !r.success);
      const allSucceeded = hasResult && !hasFailed;

      let icon: string;
      let toolColor: string;
      if (msg.expanded) {
        icon = "↓";
        toolColor = isPlan ? C_AI : C_WARNING;
      } else if (hasFailed) {
        icon = "✗";
        toolColor = C_ERROR;
      } else if (allSucceeded) {
        icon = "✓";
        toolColor = C_SUCCESS;
      } else {
        icon = SPINNER[frame % SPINNER.length] ?? "…";
        toolColor = isPlan ? C_AI : C_WARNING;
      }

      const canExpand = !hasFailed && (hasResult || !!msg.expandedContent);
      const suffix = canExpand ? " (Ctrl+O to expand)" : "";

      const headerPrefix = `${time} ${toolColor}${icon}${RESET} ${toolColor}${toolName}:${RESET} `;
      const headerSuffix = `${C_MUTED}${suffix}${RESET}`;
      const headerBodyW = Math.max(
        0,
        width - visibleWidth(headerPrefix) - visibleWidth(headerSuffix),
      );
      const lines = safeRender(rawContent, Math.max(20, bodyW));
      const headerContent = truncateToWidth(lines[0] ?? "", headerBodyW);
      out.push(`${headerPrefix}${headerContent}${headerSuffix}`);

      if (msg.previewContent)
        out.push(...renderPreviewLines(msg.previewContent, bodyW, prefixW));

      if (msg.expanded && msg.expandedContent) {
        const expandedLines = formatExpandedContent(
          stripAnsi(msg.expandedContent),
          bodyW,
          { showRawData: opts.showRawToolData },
        );
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
      // If content contains ANSI escape codes, split directly to preserve blank lines.
      // Markdown rendering collapses consecutive blank lines and may mangle ANSI sequences.
      const hasAnsi = /\x1b\[/.test(msg.content);
      const lines = hasAnsi
        ? msg.content.split("\n").flatMap((l) => wrapPlain(l, bodyW))
        : safeRender(msg.content, bodyW);
      out.push(`${time} ${C_MUTED}system:${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1))
        out.push(`${" ".repeat(prefixW)}${line}`);
    } else {
      out.push(...safeRender(msg.content, width));
    }
    out.push("");
  }
  // Safety net: clamp any line that exceeds width to prevent TUI crash
  return out.map((line) =>
    visibleWidth(line) > width ? truncateToWidth(line, width) : line,
  );
}

export { wrapPlain };
