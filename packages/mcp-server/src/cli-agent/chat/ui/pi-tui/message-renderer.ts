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
  C_ERROR,
  C_GRAY,
  C_MUTED,
  C_SUCCESS,
  C_WARNING,
  C_WHITE,
  RESET,
  SPINNER,
} from "./theme.js";
import { padToWidth, renderMarkdownish, stripAnsi, wrapPlain } from "./text.js";
import { normalizeHtml } from "../../html-utils.js";

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

function toolLineLimit(msg: Message): number {
  const name = (msg.toolName ?? "").toLowerCase();
  if (name.endsWith(" preview") || name === "plan") {
    return Infinity;
  }
  if (msg.content.includes("(ctrl+o to expand)")) {
    return Infinity;
  }
  const content = msg.content.toLowerCase();
  if (
    name.includes("edit_file") ||
    name.includes("diff") ||
    content.includes("```diff") ||
    content.includes("@@ -")
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
  return lines.map(line => visibleWidth(line) > width ? truncateToWidth(line, width) : line);
}

export function messageLines(
  messages: Message[],
  width: number,
  frame = 0,
): string[] {
  return renderMessageLines(messages, width, frame, false);
}

export function messageLinesFullView(
  messages: Message[],
  width: number,
  frame = 0,
): string[] {
  return renderMessageLines(messages, width, frame, true);
}

function renderMessageLines(
  messages: Message[],
  width: number,
  frame = 0,
  fullView = false,
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
      // Tool call message - shown between assistant and tool result
      const toolName = truncate(msg.name ?? "tool", 20);
      const prefixW = 9;
      const bodyW = Math.max(20, width - prefixW);
      const lines = safeRender(stripAnsi(msg.content), bodyW);
      const expandIcon = msg.expanded ? "↓" : "→";
      out.push(`${time} ${C_WARNING}${expandIcon}${RESET} ${C_WARNING}${toolName}:${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1))
        out.push(`${" ".repeat(prefixW)}${C_WARNING}  ${line}${RESET}`);
      // Expanded content (Ctrl+O toggle)
      if (msg.expanded && msg.expandedContent) {
        const expandedLines = safeRender(stripAnsi(msg.expandedContent), bodyW);
        out.push(`${" ".repeat(prefixW)}${C_MUTED}${"─".repeat(Math.min(bodyW, 60))}${RESET}`);
        for (const line of expandedLines)
          out.push(`${" ".repeat(prefixW)}${C_GRAY}${line}${RESET}`);
        out.push(`${" ".repeat(prefixW)}${C_MUTED}${"─".repeat(Math.min(bodyW, 60))}${RESET}`);
      }
    } else if (msg.role === "tool") {
      const isSummary = msg.content.includes("click preview · Ctrl+O full view") || msg.content.includes("(ctrl+o to expand)");
      const toolName = truncate(msg.toolName ?? "tool", 20);
      const isPreview =
        (msg.toolName ?? "").endsWith(" preview") || msg.toolName === "plan";

      if (isSummary) {
        // Tool call tree view — line-by-line state machine so ⎿ lines always render at tree
        // level regardless of position, and fenced blocks get Shiki highlight individually.
        const prefixW = 9;
        const bodyW = Math.max(20, width - prefixW);
        const metaW = Math.max(20, width - (prefixW + 3));

        const spin = SPINNER[frame % SPINNER.length] ?? "⠋";
        const colorLine = (line: string) => {
          if (line.endsWith("✓"))
            return `${C_GRAY}${line.slice(0, -1)}${RESET}${C_SUCCESS}✓${RESET}`;
          if (line.endsWith("✗"))
            return `${C_GRAY}${line.slice(0, -1)}${RESET}${C_ERROR}✗${RESET}`;
          if (line.startsWith("⎿ "))
            return `${C_GRAY}${line}${RESET} ${C_WHITE}${spin}${RESET}`;
          return `${C_GRAY}${line}${RESET}`;
        };

        const renderedToolNameOccurrences = new Map<string, number>();
        const renderExpandedResult = (line: string) => {
          const toolMatch = line.match(/^⎿ (.+?)(?: [✓✗])?$/);
          if (!toolMatch || !msg.toolResults?.length) return;
          const toolName = toolMatch[1];
          const occurrence = (renderedToolNameOccurrences.get(toolName) ?? 0) + 1;
          renderedToolNameOccurrences.set(toolName, occurrence);

          let matchingOccurrence = 0;
          const resultIndex = msg.toolResults.findIndex((result) => {
            if (result.name !== toolName) return false;
            matchingOccurrence += 1;
            return matchingOccurrence === occurrence;
          });
          // In fullView mode, show all tool results; otherwise only show the expanded one
          if (resultIndex === -1 || (!fullView && msg.expandedResultIndex !== resultIndex)) return;

          const result = msg.toolResults[resultIndex];
          if (!result) return;
          const resultContent = fullView ? (result.fullContent ?? result.content) : result.content;
          const hasDiff = resultContent.includes("@@ -") || resultContent.includes("```diff")
            || /^[-+]\s+\d+ \|/m.test(resultContent);
          const contentToRender = hasDiff && !resultContent.trimStart().startsWith("```")
            ? `\`\`\`diff\n${resultContent}\n\`\`\``
            : resultContent;
          const resultLines = safeRender(stripAnsi(contentToRender), bodyW, { noHighlight: !hasDiff });
          for (const resultLine of resultLines) {
            out.push(`${" ".repeat(prefixW)}  ${resultLine}`);
          }
        };

        const rawLines = msg.content.split("\n");
        let fenceBuf: string[] = [];
        let inFence = false;

        // First line is always the header "Called <server> — click preview · Ctrl+O full view"
        out.push(`${time} ${C_MUTED}${stripAnsi(rawLines[0] ?? "")}${RESET}`);

        for (let li = 1; li < rawLines.length; li++) {
          const rawLine = rawLines[li] ?? "";
          const clean = stripAnsi(rawLine).trimEnd();

          if (inFence) {
            if (clean.startsWith("```")) {
              // Close fence — render accumulated content with Shiki
              fenceBuf.push(rawLine);
              inFence = false;
              const rendered = safeRender(stripAnsi(fenceBuf.join("\n")), metaW, { noHighlight: false });
              for (const rl of rendered)
                out.push(`${" ".repeat(prefixW)}${C_MUTED}│${RESET}  ${rl}`);
              fenceBuf = [];
            } else {
              fenceBuf.push(rawLine);
            }
            continue;
          }

          if (clean.startsWith("```")) {
            inFence = true;
            fenceBuf = [rawLine];
          } else if (clean.startsWith("⎿ ")) {
            out.push(`${" ".repeat(prefixW)}${colorLine(clean)}`);
            renderExpandedResult(clean);
          } else if (clean === "") {
            // skip blank lines
          } else {
            // Meta text (Edit preview, Mode, Changes, ...) — │ connector, no highlight
            const rendered = safeRender(clean, metaW, { noHighlight: true });
            for (const rl of rendered)
              out.push(`${" ".repeat(prefixW)}${C_MUTED}│${RESET}  ${C_GRAY}${rl}${RESET}`);
          }
        }

        // Flush unclosed fence (e.g. pending diff still streaming)
        if (fenceBuf.length > 0) {
          const rendered = safeRender(stripAnsi(fenceBuf.join("\n")), metaW, { noHighlight: true });
          for (const rl of rendered)
            out.push(`${" ".repeat(prefixW)}${C_MUTED}│${RESET}  ${C_GRAY}${rl}${RESET}`);
        }
      } else {
        const prefixW = Math.min(9 + toolName.length + 1, 32);
        const bodyW = Math.max(20, width - prefixW);
        const rawLines = safeRender(stripAnsi(msg.content), bodyW, {
          noHighlight: !isPreview,
        });
        const limit = toolLineLimit(msg);
        const lines =
          rawLines.length > limit
            ? [
                ...rawLines.slice(0, limit),
                `${C_MUTED}... ${rawLines.length - limit} more lines${RESET}`,
              ]
            : rawLines;
        const toolColor =
          msg.toolName === "plan" || toolName.includes("plan")
            ? C_AI
            : C_WARNING;
        out.push(
          `${time} ${toolColor}${toolName}:${RESET} ${C_GRAY}${lines[0] ?? ""}${RESET}`,
        );
        for (const line of lines.slice(1))
          out.push(
            `${" ".repeat(prefixW)}${isPreview ? "" : C_GRAY}${line}${RESET}`,
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

export function messageContentLineCount(
  state: UIState,
  width: number,
  frame = 0,
): number {
  return (
    headerLines(state).length +
    messageLines(state.messages, width - 2, frame).length
  );
}

export { wrapPlain };
