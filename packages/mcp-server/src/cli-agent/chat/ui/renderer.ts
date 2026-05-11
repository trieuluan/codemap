import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import cfonts from "cfonts";
import type { GatewayMode } from "../../types.js";
import type { ChatEntry, TaskStatus } from "./chat-terminal.js";
import { getModeDisplay } from "../commands/route-policy.js";

// ─── Welcome Banner ──────────────────────────────────────

export interface WelcomeData {
  model: string;
  mode: GatewayMode;
  profile: string;
  modelCount?: number;
}

export function renderWelcome(term: Terminal, data: WelcomeData): void {
  const modeInfo = getModeDisplay(data.mode);

  // cfonts ASCII banner — compact, no box border
  const result = cfonts.render("CODEMAP", {
    font: "block",
    colors: ["cyan"],
    align: "left",
    letterSpacing: 1,
    lineHeight: 1,
    env: "node",
  });
  if (result) {
    term("\n");
    for (const line of result.array) {
      const clean = line.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
      if (clean) {
        term("  ");
        term.cyan(clean);
        term("\n");
      }
    }
  }

  // Compact info line
  term("  ");
  term.cyan(data.model);
  term.gray(" · ");
  colorByMode(term, data.mode, modeInfo.label);
  term.gray(" · ");
  term.white(data.profile);

  if (data.modelCount != null && data.modelCount > 0) {
    term.gray(" · ");
    term.green(String(data.modelCount));
    term.gray(" models");
  }
  term("\n");

  // Help hint
  term("  ");
  term.dim.gray("/help for commands · @ to mention files");
  term("\n\n");
}

// ─── Chat Messages ───────────────────────────────────────

export function renderMessage(term: Terminal, entry: ChatEntry): void {
  switch (entry.role) {
    case "welcome":
      if (entry.welcomeData) renderWelcome(term, entry.welcomeData);
      break;
    case "user":
      renderUserMessage(term, entry.content);
      break;
    case "assistant":
      renderAssistantMessage(term, entry.content);
      break;
    case "tool":
      renderToolMessage(term, entry);
      break;
    case "system":
      renderSystemMessage(term, entry.content);
      break;
  }
}

function renderUserMessage(term: Terminal, content: string): void {
  term("\n");
  term.bold.green("  > ");
  term.white(content);
  term("\n");
}

function renderAssistantMessage(term: Terminal, content: string): void {
  const width = (term.width || 80) - 4;
  term("\n");
  const lines = wrapText(content, width, "  ");
  for (const line of lines.split("\n")) {
    term("  ");
    term(line);
    term("\n");
  }
}

function renderToolMessage(term: Terminal, entry: ChatEntry): void {
  if (entry.toolName?.endsWith(" result")) {
    // Tool result — dim
    term("  ");
    term.dim.gray(`↳ ${entry.toolName}: ${truncate(entry.content, 200)}`);
    term("\n");
  } else {
    // Tool call
    term("  ");
    term.yellow("⚡ ");
    term.yellow(entry.toolName || "tool");
    term("\n");
    term("  ");
    term.dim.gray(truncate(entry.content, 200));
    term("\n");
  }
}

function renderSystemMessage(term: Terminal, content: string): void {
  const lower = content.toLowerCase();
  if (lower.startsWith("error") || lower.startsWith("blocked:")) {
    term("\n  ");
    term.bold.red(content);
    term("\n");
  } else if (lower.startsWith("warning") || lower.startsWith("⚠")) {
    term("\n  ");
    term.yellow(content);
    term("\n");
  } else if (
    lower.startsWith("switched") ||
    lower.startsWith("connected") ||
    lower.startsWith("done")
  ) {
    term("\n  ");
    term.green(content);
    term("\n");
  } else {
    term("\n  ");
    term.gray(content);
    term("\n");
  }
}

// ─── Task Status Bar ─────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function renderTaskStatus(
  term: Terminal,
  status: TaskStatus,
  frame: number,
): void {
  const elapsed = status.startTime
    ? (status.endTime ?? Date.now()) - status.startTime
    : 0;
  const elapsedStr = formatElapsed(elapsed);
  const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];

  switch (status.phase) {
    case "thinking":
      term("\n  ");
      term.gray(`${spinner} Thinking...`);
      term.dim.gray(` ${elapsedStr}`);
      if (status.model) term.dim.cyan(` ${status.model}`);
      term("\n");
      break;

    case "tool":
      term("\n  ");
      term.yellow(`${spinner} ${status.toolName ?? "tool"}`);
      term.dim.gray(` ${elapsedStr}`);
      term("\n");
      if (status.toolArgs) {
        term("  ");
        term.dim.gray(truncate(status.toolArgs, 100));
        term("\n");
      }
      break;

    case "streaming":
      term("\n  ");
      term.cyan("↓ Streaming");
      term.dim.gray(` ${elapsedStr}`);
      if (status.usage) {
        term.dim.gray(
          ` · ${formatTokenCount(status.usage.promptTokens)} in / ${formatTokenCount(status.usage.completionTokens)} out`,
        );
      }
      term("\n");
      break;

    case "done":
      term("\n  ");
      term.green(`✓ ${elapsedStr}`);
      if (status.toolsCalled > 0) {
        term.dim.gray(` · ${status.toolsCalled} tool${status.toolsCalled > 1 ? "s" : ""}`);
      }
      if (status.usage) {
        term.dim.gray(` · ${formatTokenCount(status.usage.totalTokens)} tokens`);
      }
      term("\n");
      break;
  }
}

// ─── Confirm Dialog ──────────────────────────────────────

export interface ConfirmDialogData {
  name: string;
  preview: string | null;
}

export function renderConfirmDialog(
  term: Terminal,
  dialog: ConfirmDialogData,
): void {
  term("\n");
  term.yellow(`  ${dialog.name}`);
  term.white(" wants to edit files");
  term("\n");

  if (dialog.preview) {
    const lines = dialog.preview.split("\n").slice(0, 15);
    for (const line of lines) {
      const trimmed = line.slice(0, 76);
      term("  ");
      if (trimmed.startsWith("+")) {
        term.green(trimmed);
      } else if (trimmed.startsWith("-")) {
        term.red(trimmed);
      } else {
        term.gray(trimmed);
      }
      term("\n");
    }
  }

  term("\n  ");
  term.bold.green("y");
  term.gray("es  ");
  term.bold.red("n");
  term.gray("o  ");
  term.bold.cyan("a");
  term.gray("ll (accept all)");
  term("\n");
}

// ─── Status Line ─────────────────────────────────────────

export function renderStatusLine(
  term: Terminal,
  model: string,
  mode: GatewayMode,
  flags: { debug: boolean; autoAccept: boolean; historyCount: number },
): void {
  const modeInfo = getModeDisplay(mode);
  term("\n");
  term("  ");
  term.cyan(model);
  term.gray(" · ");
  colorByMode(term, mode, modeInfo.label);
  if (flags.debug) {
    term.gray(" · ");
    term.bold.red("DEBUG");
  }
  if (flags.autoAccept) {
    term.gray(" · ");
    term.bold.green("ACCEPT ALL");
  }
  term.gray(` · ${flags.historyCount} msgs`);
  term("\n");
}

// ─── Helpers ─────────────────────────────────────────────

function colorByMode(
  term: Terminal,
  mode: GatewayMode | string,
  text: string,
): void {
  switch (mode) {
    case "local-only":
      term.red(text);
      break;
    case "ask-before-cloud":
      term.yellow(text);
      break;
    case "cloud-ok":
      term.green(text);
      break;
    case "hybrid":
      term.cyan(text);
      break;
    default:
      term.cyan(text);
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(0);
  return `${m}m${sec}s`;
}

function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function wrapText(text: string, maxWidth: number, indent: string): string {
  if (!text) return "";
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n" + indent);
}
