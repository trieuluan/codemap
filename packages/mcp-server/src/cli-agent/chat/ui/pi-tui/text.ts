import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import {
  BOLD,
  C_ACTION,
  C_AI,
  C_GRAY,
  C_MUTED,
  C_SUCCESS,
  C_ERROR,
  C_WARNING,
  RESET,
} from "./theme.js";
import { highlightBlock, isShikiReady } from "./shiki-highlight.js";

export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")  // CSI sequences (colors, cursor, etc.)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")  // OSC sequences
    .replace(CURSOR_MARKER, "");
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
    .replace(/`([^`\n]+)`/g, `${C_ACTION}$1${RESET}`);
}

const CODE_LANG_ALIASES: Record<string, string> = {
  bash: "sh",
  shell: "sh",
  javascript: "js",
  jsx: "js",
  jsonc: "json",
  kotlin: "kt",
  typescript: "ts",
  tsx: "ts",
};

const KEYWORD_LANGS = new Set(["ts", "js", "dart", "java", "kt", "kotlin"]);
const KEYWORDS =
  /\b(abstract|as|async|await|break|case|catch|class|const|continue|default|do|else|enum|export|extends|final|finally|for|fun|function|if|implements|import|in|interface|let|new|null|override|package|private|protected|public|return|static|super|switch|this|throw|throws|try|type|val|var|void|when|while|yield)\b/g;
const STRING_RE = /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g;
const NUMBER_RE = /\b(\d+(?:\.\d+)?)\b/g;
const COMMENT_RE = /(\/\/.*|#.*)$/;

function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase().trim();
  return CODE_LANG_ALIASES[lower] ?? lower;
}

function highlightCodeLine(raw: string, lang: string): string {
  const normalized = normalizeLang(lang);
  if (normalized === "diff") {
    if (raw.startsWith("+") && !raw.startsWith("+++")) return `${C_SUCCESS}${raw}${RESET}`;
    if (raw.startsWith("-") && !raw.startsWith("---")) return `${C_ERROR}${raw}${RESET}`;
    if (raw.startsWith("@@")) return `${C_ACTION}${raw}${RESET}`;
    if (raw.startsWith("diff ") || raw.startsWith("index ") || raw.startsWith("---") || raw.startsWith("+++")) {
      return `${C_WARNING}${raw}${RESET}`;
    }
    return `${C_MUTED}${raw}${RESET}`;
  }

  if (normalized === "json") {
    return raw
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)?/g, (_m, key: string, colon: string | undefined) =>
        colon ? `${C_ACTION}${key}${RESET}${colon}` : `${C_SUCCESS}${key}${RESET}`,
      )
      .replace(/\b(true|false|null)\b/g, `${C_WARNING}$1${RESET}`)
      .replace(NUMBER_RE, `${C_WARNING}$1${RESET}`);
  }

  if (normalized === "sh") {
    const comment = raw.match(COMMENT_RE);
    const body = comment && comment.index !== undefined ? raw.slice(0, comment.index) : raw;
    const suffix = comment ? `${C_GRAY}${comment[0]}${RESET}` : "";
    return body
      .replace(/\b(cd|cp|echo|export|find|git|grep|ls|mkdir|npm|pnpm|rm|sed|yarn)\b/g, `${C_ACTION}$1${RESET}`)
      .replace(STRING_RE, `${C_SUCCESS}$1${RESET}`)
      .replace(NUMBER_RE, `${C_WARNING}$1${RESET}`) + suffix;
  }

  if (KEYWORD_LANGS.has(normalized)) {
    const comment = raw.match(COMMENT_RE);
    const body = comment && comment.index !== undefined ? raw.slice(0, comment.index) : raw;
    const suffix = comment ? `${C_GRAY}${comment[0]}${RESET}` : "";
    return body
      .replace(STRING_RE, `${C_SUCCESS}$1${RESET}`)
      .replace(KEYWORDS, `${C_ACTION}$1${RESET}`)
      .replace(NUMBER_RE, `${C_WARNING}$1${RESET}`) + suffix;
  }

  return raw;
}

export function renderMarkdownish(text: string, width: number, options?: { noHighlight?: boolean }): string[] {
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];

  const flushCodeBlock = () => {
    const code = codeLines.join("\n");
    const useShiki = !options?.noHighlight && isShikiReady() && codeLang !== "diff";
    const hlLines = useShiki
      ? highlightBlock(code, codeLang)
      : codeLines.map((l) => options?.noHighlight ? l : highlightCodeLine(l.length === 0 ? " " : l, codeLang));
    for (const hl of hlLines) {
      for (const wrapped of wrapPlain(hl, Math.max(8, width - 4))) {
        out.push(`    ${wrapped}${RESET}`);
      }
    }
    codeLines = [];
  };

  for (const raw of text.split("\n")) {
    const fence = raw.match(/^\s*```(\S*)?/);
    if (fence) {
      if (!inCode) {
        inCode = true;
        codeLang = fence[1] ?? "";
        codeLines = [];
      } else {
        flushCodeBlock();
        inCode = false;
        codeLang = "";
      }
      const label = inCode ? ` code${codeLang ? `:${codeLang}` : ""} ` : " end ";
      out.push(`${C_MUTED}${"-".repeat(Math.min(width, Math.max(12, label.length + 8)))}${RESET}`);
      continue;
    }

    if (inCode) {
      codeLines.push(raw);
      continue;
    }

    const heading = raw.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
    if (heading) {
      const text = cleanInlineMarkdown(heading[2] ?? "");
      const marker = heading[1]!.length <= 2 ? C_AI : C_ACTION;
      for (const [i, line] of wrapPlain(text, Math.max(8, width - 2)).entries()) {
        out.push(i === 0 ? `${marker}${BOLD}${line}${RESET}` : `  ${line}`);
      }
      continue;
    }

    const bullet = raw.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      const lines = wrapPlain(bullet[1] ?? "", Math.max(8, width - 2));
      out.push(`${C_ACTION}-${RESET} ${renderInlineMarkdown(lines[0] ?? "")}`);
      for (const line of lines.slice(1)) out.push(`  ${renderInlineMarkdown(line)}`);
      continue;
    }

    const numbered = raw.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      const prefix = `${numbered[1]}. `;
      const lines = wrapPlain(numbered[2] ?? "", Math.max(8, width - visibleWidth(prefix)));
      out.push(`${C_ACTION}${prefix}${RESET}${renderInlineMarkdown(lines[0] ?? "")}`);
      for (const line of lines.slice(1)) out.push(`${" ".repeat(visibleWidth(prefix))}${renderInlineMarkdown(line)}`);
      continue;
    }

    for (const line of wrapPlain(raw, width)) out.push(renderInlineMarkdown(line));
  }

  return out;
}
