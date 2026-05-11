import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import type { GatewayMode } from "../../../types.js";

// ─── Color Palette ──────────────────────────────────────

export const C = {
  primary: "cyan" as const,
  secondary: "magenta" as const,
  success: "green" as const,
  warning: "yellow" as const,
  error: "red" as const,
  text: "white" as const,
  dim: "gray" as const,
  border: "gray" as const,
};

// ─── ANSI Helpers ───────────────────────────────────────

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function visibleLen(text: string): number {
  return stripAnsi(text).length;
}

// ─── Drawing Primitives ─────────────────────────────────

export function drawBox(
  term: Terminal,
  width: number,
  opts: {
    title?: string;
    titleColor?: (t: Terminal, s: string) => void;
    borderColor?: (t: Terminal, s: string) => void;
    padLeft?: number;
  },
): { innerW: number; sp: string } {
  const boxW = Math.min(width - 4, 76);
  const innerW = boxW - 2;
  const pad = Math.max(0, Math.floor((width - boxW) / 2));
  const sp = " ".repeat(pad);
  const bc = opts.borderColor ?? ((t: Terminal) => t.dim.gray);
  const hLine = "─".repeat(innerW);

  // Top border
  term(sp);
  bc(term, "┌");
  if (opts.title) {
    const tc = opts.titleColor ?? ((t: Terminal, s: string) => t.cyan(s));
    bc(term, "─┤ ");
    tc(term, opts.title);
    bc(term, " ├" + hLine.slice(4 + opts.title.length + 2) + "┐");
  } else {
    bc(term, hLine + "┐");
  }
  term("\n");

  return { innerW, sp };
}

export function drawBoxLine(
  term: Terminal,
  sp: string,
  innerW: number,
  content: string,
  borderFn?: (t: Terminal, s: string) => void,
): void {
  const bc = borderFn ?? ((t: Terminal) => t.dim.gray);
  const padR = innerW - visibleLen(content);
  term(sp);
  bc(term, "│ ");
  term(content);
  if (padR > 1) term(" ".repeat(padR - 1));
  bc(term, "│");
  term("\n");
}

export function drawBoxSeparator(
  term: Terminal,
  sp: string,
  innerW: number,
  borderFn?: (t: Terminal, s: string) => void,
): void {
  const bc = borderFn ?? ((t: Terminal) => t.dim.gray);
  const hLine = "─".repeat(innerW);
  term(sp);
  bc(term, "├" + hLine + "┤");
  term("\n");
}

export function drawBoxEnd(
  term: Terminal,
  sp: string,
  innerW: number,
  borderFn?: (t: Terminal, s: string) => void,
): void {
  const bc = borderFn ?? ((t: Terminal) => t.dim.gray);
  const hLine = "─".repeat(innerW);
  term(sp);
  bc(term, "└" + hLine + "┘");
  term("\n");
}

export function drawBoxRow(
  term: Terminal,
  sp: string,
  innerW: number,
  label: string,
  value: string,
  valueColor: (t: Terminal, v: string) => void,
  borderFn?: (t: Terminal, s: string) => void,
): void {
  const bc = borderFn ?? ((t: Terminal) => t.dim.gray);
  const labelW = 12;
  const contentLen = 2 + labelW + visibleLen(value);
  const padR = innerW - contentLen;

  term(sp);
  bc(term, "│ ");
  term.dim.gray(label.padEnd(labelW));
  valueColor(term, value);
  if (padR > 0) term(" ".repeat(padR));
  bc(term, "│");
  term("\n");
}

export function centerText(
  term: Terminal,
  text: string,
  width: number,
  render?: (t: Terminal, s: string) => void,
): void {
  const textLen = visibleLen(text);
  const pad = Math.max(0, Math.floor((width - textLen) / 2));
  term(" ".repeat(pad));
  if (render) {
    render(term, text);
  } else {
    term(text);
  }
  term("\n");
}

// ─── Keycap Rendering ───────────────────────────────────

export function drawKeycap(term: Terminal, key: string, label: string): void {
  term.cyan("[");
  term.bold.cyan(key);
  term.cyan("]");
  term.gray(" " + label + "  ");
}

// ─── Formatters ─────────────────────────────────────────

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(0);
  return `${m}m${sec}s`;
}

export function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function wrapText(text: string, maxWidth: number, indent: string): string {
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

// ─── Mode Color ─────────────────────────────────────────

export function colorByMode(
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
