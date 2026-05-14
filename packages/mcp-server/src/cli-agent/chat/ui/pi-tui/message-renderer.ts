import cfonts from "cfonts";
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
  if (name.endsWith(" preview")) {
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
    ].join(`  ${C_MUTED}|${RESET}  `).padStart(2),
    `  ${C_ACTION}${BOLD}> Quick Start:${RESET} ${C_GRAY}/help for commands  .  @ for files  .  Tab for suggestions  .  Ctrl+C cancel${RESET}`,
    "",
  ];
}

// Replace inline base64 image data with a short placeholder before rendering.
// Without this, marked tries to tokenize multi-MB base64 strings and freezes.
function stripBase64Images(text: string): string {
  return text.replace(
    /!\[([^\]]*)\]\(data:image\/[^;]+;base64,[a-zA-Z0-9+/=\s]+\)/g,
    (_match, alt) => `[image${alt ? `: ${alt}` : ""}]`,
  );
}

// Safe wrapper: if renderMarkdownish throws (e.g. broken markdown from a
// truncated tool result), fall back to plain line-split to avoid crashing doRefresh.
function safeRender(content: string, width: number, opts?: { noHighlight?: boolean }): string[] {
  try {
    return renderMarkdownish(stripBase64Images(content), width, opts);
  } catch {
    return stripBase64Images(content).split("\n").flatMap((l) => wrapPlain(l, width));
  }
}

export function messageLines(messages: Message[], width: number): string[] {
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
      const bg = (raw: string) => BG_USER + padToWidth(raw, width).replace(/\x1b\[0m/g, `\x1b[0m${BG_USER}`) + RESET;
      const prefixW = 11;
      const bodyW = Math.max(20, width - prefixW - 2);
      const lines = safeRender(msg.content, bodyW);
      out.push(bg(`${time} ${C_ACTION}>${RESET} ${lines[0] ?? ""}`));
      for (const line of lines.slice(1)) out.push(bg(`${" ".repeat(prefixW)}${line}`));
    } else if (msg.role === "assistant") {
      const prefixW = 9;
      const bodyW = Math.max(20, width - prefixW);
      const lines = safeRender(stripAnsi(msg.content), bodyW);
      out.push(`${time} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(prefixW)}${line}`);
    } else if (msg.role === "tool") {
      const toolName = truncate(msg.toolName ?? "tool", 20);
      const prefixW = Math.min(9 + toolName.length + 1, 32);
      const bodyW = Math.max(20, width - prefixW);
      const isPreview = (msg.toolName ?? "").endsWith(" preview") || msg.toolName === "plan";
      const rawLines = safeRender(stripAnsi(msg.content), bodyW, { noHighlight: !isPreview });
      const limit = toolLineLimit(msg);
      const lines = rawLines.length > limit
        ? [...rawLines.slice(0, limit), `${C_MUTED}... ${rawLines.length - limit} more lines${RESET}`]
        : rawLines;
      const toolColor = msg.toolName === "plan" || toolName.includes("plan") ? C_AI : C_WARNING;
      out.push(`${time} ${toolColor}${toolName}:${RESET} ${C_GRAY}${lines[0] ?? ""}${RESET}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(prefixW)}${isPreview ? "" : C_GRAY}${line}${RESET}`);
    } else if (msg.role === "system") {
      const prefixW = 17;
      const bodyW = Math.max(20, width - prefixW);
      const lines = safeRender(msg.content, bodyW);
      out.push(`${time} ${C_MUTED}system:${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(prefixW)}${line}`);
    } else {
      out.push(...safeRender(msg.content, width));
    }
    out.push("");
  }
  return out;
}

export function messageContentLineCount(state: UIState, width: number): number {
  return headerLines(state).length + messageLines(state.messages, width - 2).length;
}

export { wrapPlain };
