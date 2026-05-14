import cfonts from "cfonts";
import type { Message, UIState } from "../store.js";
import { formatTime, gradientStr, truncate } from "../ink-utils.js";
import { getModeDisplay } from "../../commands/route-policy.js";
import { BOLD, RESET, C_CYAN, C_GRAY, C_GREEN, C_WHITE, C_YELLOW } from "./theme.js";
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
  const modeInfo = getModeDisplay(state.config.mode);
  const workspace = state.workspace?.repoName ?? state.config.profile;
  if (state.messages.length > 0) {
    return [
      `${C_CYAN}${BOLD}codemap${RESET} ${C_GRAY}${workspace}${RESET} ${C_GRAY}|${RESET} ${C_WHITE}${truncate(state.config.model, 22)}${RESET} ${C_GRAY}|${RESET} ${C_GREEN}${modeInfo.label}${RESET} ${C_GRAY}|${RESET} ${C_CYAN}MCP connected${RESET}`,
      `${C_GRAY}${"-".repeat(72)}${RESET}`,
    ];
  }
  return [
    "",
    ...BANNER_LINES,
    gradientStr(
      "  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM",
      { r: 34, g: 211, b: 238 },
      { r: 168, g: 85, b: 247 },
      false,
    ),
    "",
    [
      `${C_CYAN}o${RESET} ${C_WHITE}v0.1.0${RESET}`,
      `${C_CYAN}@${RESET} ${C_WHITE}${truncate(workspace, 20)}${RESET}`,
      `${C_CYAN}*${RESET} ${C_WHITE}${truncate(state.config.model, 24)}${RESET}`,
      `${C_CYAN}~${RESET} ${C_GREEN}${modeInfo.label}${RESET}`,
      `${C_CYAN}#${RESET} ${C_CYAN}Connected${RESET}`,
    ].join(`  ${C_GRAY}|${RESET}  `).padStart(2),
    `  ${C_CYAN}${BOLD}> Quick Start:${RESET} ${C_GRAY}/help for commands  .  @ for files  .  Tab for suggestions  .  Ctrl+C cancel${RESET}`,
    "",
  ];
}

export function messageLines(messages: Message[], width: number): string[] {
  if (messages.length === 0) {
    return [
      `${C_CYAN}${BOLD}Welcome to CodeMap Agent${RESET}`,
      `${C_GRAY}Ask a question, mention files with @, or type /help.${RESET}`,
      "",
    ];
  }

  const out: string[] = [];
  // Prefix visible widths (used to compute matching body wrap width and continuation indent):
  // user:      "HH:MM:SS > "          = 11
  // assistant: "HH:MM:SS assistant: " = 20
  // tool:      "HH:MM:SS toolname: "  = 9 + name (capped)
  // system:    "HH:MM:SS system: "    = 17
  for (const msg of messages) {
    const time = `${C_GRAY}${formatTime(msg.timestamp)}${RESET}`;
    if (msg.role === "user") {
      const BG = "\x1b[48;2;40;44;52m";
      const bg = (raw: string) => BG + padToWidth(raw, width).replace(/\x1b\[0m/g, `\x1b[0m${BG}`) + RESET;
      const prefixW = 11;
      const bodyW = Math.max(20, width - prefixW - 2);
      const lines = renderMarkdownish(msg.content, bodyW);
      out.push(bg(`${time} ${C_GREEN}>${RESET} ${lines[0] ?? ""}`));
      for (const line of lines.slice(1)) out.push(bg(`${" ".repeat(prefixW)}${line}`));
    } else if (msg.role === "assistant") {
      const prefixW = 9;
      const bodyW = Math.max(20, width - prefixW);
      const lines = renderMarkdownish(stripAnsi(msg.content), bodyW);
      out.push(`${time} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(prefixW)}${line}`);
    } else if (msg.role === "tool") {
      const toolName = truncate(msg.toolName ?? "tool", 20);
      const prefixW = Math.min(9 + toolName.length + 1, 32);
      const bodyW = Math.max(20, width - prefixW);
      const rawLines = renderMarkdownish(stripAnsi(msg.content), bodyW, { noHighlight: true });
      const limit = toolLineLimit(msg);
      const lines = rawLines.length > limit
        ? [...rawLines.slice(0, limit), `${C_GRAY}... ${rawLines.length - limit} more lines${RESET}`]
        : rawLines;
      out.push(`${time} ${C_YELLOW}${toolName}:${RESET} ${C_GRAY}${lines[0] ?? ""}${RESET}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(prefixW)}${C_GRAY}${line}${RESET}`);
    } else if (msg.role === "system") {
      const prefixW = 17;
      const bodyW = Math.max(20, width - prefixW);
      const lines = renderMarkdownish(msg.content, bodyW);
      out.push(`${time} ${C_GRAY}system:${RESET} ${lines[0] ?? ""}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(prefixW)}${line}`);
    } else {
      out.push(...renderMarkdownish(msg.content, width));
    }
    out.push("");
  }
  return out;
}

export function messageContentLineCount(state: UIState, width: number): number {
  return headerLines(state).length + messageLines(state.messages, width - 2).length;
}

export { wrapPlain };
