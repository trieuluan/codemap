import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import { C_CYAN, C_GRAY, C_WHITE, BOLD, RESET } from "./theme.js";

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(CURSOR_MARKER, "");
}

export function padToWidth(line: string, width: number): string {
  const pad = Math.max(0, width - visibleWidth(line));
  return line + " ".repeat(pad);
}

export function truncateVisible(line: string, width: number): string {
  if (visibleWidth(line) <= width) return line;
  let out = "";
  for (const ch of line) {
    if (visibleWidth(out + ch) > Math.max(0, width - 1)) break;
    out += ch;
  }
  return out + "…";
}

export function fitLine(line: string, width: number): string {
  return padToWidth(truncateVisible(line, width), width);
}

export function wrapPlain(text: string, width: number): string[] {
  const max = Math.max(1, width);
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let remaining = para;
    if (remaining.length === 0) { out.push(""); continue; }
    while (visibleWidth(remaining) > max) {
      // Walk char-by-char skipping ANSI sequences to find the correct break byte index
      let vis = 0;
      let i = 0;
      let lastSpaceI = -1;
      while (i < remaining.length) {
        if (remaining.charCodeAt(i) === 0x1b && remaining[i + 1] === "[") {
          const end = remaining.indexOf("m", i + 2);
          if (end !== -1) { i = end + 1; continue; }
        }
        if (remaining[i] === " ") lastSpaceI = i;
        vis++;
        i++;
        if (vis >= max) break;
      }
      const breakAt = lastSpaceI > 0 ? lastSpaceI : i;
      out.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }
    out.push(remaining);
  }
  return out;
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export function renderInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, `${BOLD}$1${RESET}`)
    .replace(/__([^_\n]+)__/g, `${BOLD}$1${RESET}`)
    .replace(/`([^`\n]+)`/g, `${C_CYAN}$1${RESET}`);
}

export function renderMarkdownish(text: string, width: number): string[] {
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";

  for (const raw of text.split("\n")) {
    const fence = raw.match(/^\s*```(\S*)?/);
    if (fence) {
      inCode = !inCode;
      codeLang = inCode ? fence[1] ?? "" : "";
      const label = inCode ? ` code${codeLang ? `:${codeLang}` : ""} ` : " end ";
      out.push(`${C_GRAY}${"-".repeat(Math.min(width, Math.max(12, label.length + 8)))}${RESET}`);
      continue;
    }

    if (inCode) {
      const line = raw.length === 0 ? " " : raw;
      for (const wrapped of wrapPlain(line, Math.max(8, width - 4))) {
        out.push(`${C_GRAY}    ${wrapped}${RESET}`);
      }
      continue;
    }

    const heading = raw.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
    if (heading) {
      const text = cleanInlineMarkdown(heading[2] ?? "");
      const marker = heading[1]!.length <= 2 ? C_CYAN : C_WHITE;
      for (const [i, line] of wrapPlain(text, Math.max(8, width - 2)).entries()) {
        out.push(i === 0 ? `${marker}${BOLD}${line}${RESET}` : `  ${line}`);
      }
      continue;
    }

    const bullet = raw.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      const lines = wrapPlain(bullet[1] ?? "", Math.max(8, width - 2));
      out.push(`${C_CYAN}-${RESET} ${renderInlineMarkdown(lines[0] ?? "")}`);
      for (const line of lines.slice(1)) out.push(`  ${renderInlineMarkdown(line)}`);
      continue;
    }

    const numbered = raw.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      const prefix = `${numbered[1]}. `;
      const lines = wrapPlain(numbered[2] ?? "", Math.max(8, width - visibleWidth(prefix)));
      out.push(`${C_CYAN}${prefix}${RESET}${renderInlineMarkdown(lines[0] ?? "")}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(visibleWidth(prefix))}${renderInlineMarkdown(line)}`);
      continue;
    }

    for (const line of wrapPlain(raw, width)) out.push(renderInlineMarkdown(line));
  }

  return out;
}
