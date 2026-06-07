import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import { Marked } from "marked";
import TerminalRenderer from "marked-terminal";
import type { ChatMode, ChatWorkspaceState } from "../../chat/state/store.js";
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
  BG_DIFF_ADD,
  BG_DIFF_DELETE,
} from "../theme.js";
import { highlightBlock, isShikiReady } from "../renderer/shiki-highlight.js";

type MarkdownToken = Record<string, unknown>;
type ListItemToken = MarkdownToken & {
  checked?: boolean;
  loose?: boolean;
  task?: boolean;
  tokens?: unknown[];
};

export function workspaceStateCardLines(state: ChatWorkspaceState, mode: ChatMode, width: number): string[] {
  const project = state.projectName ?? state.repoName ?? "local workspace";
  const branch = state.branch ?? "unknown branch";
  const indexColor = state.isIndexStale ? C_WARNING : state.indexStatus === "failed" ? C_ERROR : C_SUCCESS;
  const index = `${indexColor}${state.indexStatus}${RESET}${state.indexUpdatedAt ? `${C_GRAY} · ${state.indexUpdatedAt}${RESET}` : ""}`;
  const changes = state.hasLocalChanges ? `${C_WARNING}${state.changedFilesCount} files${RESET}` : `${C_SUCCESS}none${RESET}`;
  const basis = state.includeDiff ? "indexed + local diff" : "indexed only";
  const lines = [
    `${BOLD}Workspace${RESET} ${C_GRAY}Project:${RESET} ${project}  ${C_GRAY}Branch:${RESET} ${branch}  ${C_GRAY}Mode:${RESET} ${mode}`,
    `${C_GRAY}Index:${RESET} ${index}  ${C_GRAY}Local changes:${RESET} ${changes}  ${C_GRAY}Basis:${RESET} ${basis}`,
  ];
  if (state.isIndexStale) lines.push(`${C_WARNING}Index may be stale. Use current diff or refresh index before relying on graph-only answers.${RESET}`);
  return lines.flatMap((line) => wrapPlain(line, Math.max(20, width)));
}

const RENDERER_METHODS = [
  "blockquote",
  "br",
  "code",
  "codespan",
  "del",
  "em",
  "heading",
  "hr",
  "html",
  "image",
  "link",
  "list",
  "listitem",
  "paragraph",
  "strong",
  "table",
  "text",
] as const;

export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "") // CSI sequences (colors, cursor, etc.)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC sequences
    .replace(CURSOR_MARKER, "");
}

export function visibleTextWidth(text: string): number {
  return visibleWidth(stripAnsi(text));
}

function ansiSequenceEnd(text: string, index: number): number | null {
  if (text.charCodeAt(index) !== 0x1b) return null;
  if (text[index + 1] === "[") {
    for (let i = index + 2; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 0x40 && code <= 0x7e) return i + 1;
    }
  }
  if (text[index + 1] === "]") {
    const bel = text.indexOf("\x07", index + 2);
    const st = text.indexOf("\x1b\\", index + 2);
    if (bel !== -1 && (st === -1 || bel < st)) return bel + 1;
    if (st !== -1) return st + 2;
  }
  return null;
}

export function padToWidth(line: string, width: number): string {
  const pad = Math.max(0, width - visibleTextWidth(line));
  return line + " ".repeat(pad);
}

export function truncateVisible(line: string, width: number, silent = false): string {
  const max = Math.max(0, width);
  // Fast path: no ANSI and fits.
  if (line.indexOf("\x1b") === -1) {
    if (line.length <= max) return line;
    return silent ? line.slice(0, max) : line.slice(0, Math.max(0, max - 1)) + "…";
  }
  if (visibleTextWidth(line) <= max) return line;
  // Reserve one column for the ellipsis so content + "…" still fits within max.
  const limit = silent ? max : Math.max(0, max - 1);
  let vis = 0;
  let i = 0;
  while (i < line.length && vis < limit) {
    const nextAnsiIndex = ansiSequenceEnd(line, i);
    if (nextAnsiIndex !== null) {
      i = nextAnsiIndex;
      continue;
    }
    vis += visibleWidth(line[i] ?? "");
    i++;
  }
  return silent ? line.slice(0, i) : line.slice(0, i) + "…";
}

export function fitLine(line: string, width: number): string {
  return padToWidth(truncateVisible(line, width), width);
}

/** Like fitLine but clips silently — no ellipsis. Used for diff line rendering. */
export function fitLineSilent(line: string, width: number): string {
  return padToWidth(truncateVisible(line, width, true), width);
}

export function wrapPlain(text: string, width: number): string[] {
  const max = Math.max(1, width);
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let remaining = para;
    if (remaining.length === 0) {
      out.push("");
      continue;
    }
    while (visibleTextWidth(remaining) > max) {
      // Walk char-by-char skipping ANSI sequences to find the correct break byte index
      let vis = 0;
      let i = 0;
      let lastSpaceI = -1;
      while (i < remaining.length) {
        const nextAnsiIndex = ansiSequenceEnd(remaining, i);
        if (nextAnsiIndex !== null) {
          i = nextAnsiIndex;
          continue;
        }
        const char = remaining[i] ?? "";
        if (char === " ") lastSpaceI = i;
        vis += visibleWidth(char);
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
const COMMENT_RE = /(\/\/.*|#.*)$/;

function normalizeLang(lang: string): string {
  const lower = lang.toLowerCase().trim();
  return CODE_LANG_ALIASES[lower] ?? lower;
}

function langFromPath(path: string): string {
  const clean = path.replace(/^[ab]\//, "").split("?")[0] ?? "";
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    bash: "sh",
    cjs: "js",
    css: "css",
    dart: "dart",
    java: "java",
    js: "js",
    json: "json",
    jsonc: "json",
    jsx: "js",
    kt: "kt",
    kts: "kt",
    md: "markdown",
    mdx: "markdown",
    mjs: "js",
    php: "php",
    py: "python",
    sh: "sh",
    ts: "ts",
    tsx: "ts",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sql: "sql",
    html: "html",
    xml: "xml",
    rs: "rust",
    go: "go",
    rb: "ruby",
    swift: "swift",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    vue: "vue",
  };
  return byExt[ext] ?? "";
}

function highlightCodeLineFallback(raw: string, lang: string): string {
  const normalized = normalizeLang(lang);
  if (normalized === "diff") {
    if (raw.startsWith("+") && !raw.startsWith("+++"))
      return `${C_SUCCESS}${raw}${RESET}`;
    if (raw.startsWith("-") && !raw.startsWith("---"))
      return `${C_ERROR}${raw}${RESET}`;
    if (raw.startsWith("@@")) return `${C_ACTION}${raw}${RESET}`;
    if (
      raw.startsWith("diff ") ||
      raw.startsWith("index ") ||
      raw.startsWith("---") ||
      raw.startsWith("+++")
    ) {
      return `${C_WARNING}${raw}${RESET}`;
    }
    return `${C_MUTED}${raw}${RESET}`;
  }

  if (normalized === "json") {
    return raw
      .replace(
        /("(?:[^"\\]|\\.)*")(\s*:)?/g,
        (_m, key: string, colon: string | undefined) =>
          colon
            ? `${C_ACTION}${key}${RESET}${colon}`
            : `${C_SUCCESS}${key}${RESET}`,
      )
      .replace(/\b(true|false|null)\b/g, `${C_WARNING}$1${RESET}`)
      ;
  }

  if (normalized === "sh") {
    const comment = raw.match(COMMENT_RE);
    const body =
      comment && comment.index !== undefined
        ? raw.slice(0, comment.index)
        : raw;
    const suffix = comment ? `${C_GRAY}${comment[0]}${RESET}` : "";
    return (
      body
        .replace(
          /\b(cd|cp|echo|export|find|git|grep|ls|mkdir|npm|pnpm|rm|sed|yarn)\b/g,
          `${C_ACTION}$1${RESET}`,
        )
        .replace(STRING_RE, `${C_SUCCESS}$1${RESET}`) + suffix
    );
  }

  if (KEYWORD_LANGS.has(normalized)) {
    const comment = raw.match(COMMENT_RE);
    const body =
      comment && comment.index !== undefined
        ? raw.slice(0, comment.index)
        : raw;
    const suffix = comment ? `${C_GRAY}${comment[0]}${RESET}` : "";
    return (
      body
        .replace(STRING_RE, `${C_SUCCESS}$1${RESET}`)
        .replace(KEYWORDS, `${C_ACTION}$1${RESET}`) + suffix
    );
  }

  return raw;
}

function isToken(value: unknown): value is MarkdownToken {
  return typeof value === "object" && value !== null;
}

function tokenText(value: unknown): string {
  if (!isToken(value)) return String(value ?? "");
  const text = value.text;
  if (typeof text === "string") return text;
  const raw = value.raw;
  return typeof raw === "string" ? raw : "";
}

function stripTrailingBlankLines(lines: string[]): string[] {
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function reapplyBackground(line: string, bg: string): string {
  return bg + line.replace(/\x1b\[0m/g, `${RESET}${bg}`) + RESET;
}

// edit_file preview puts the path in the hunk header: "@@ -1,4 +1,4 @@ /path/file.ts:1-10"
function langFromHunkHeader(hunkText: string): string {
  const match = hunkText.match(/@@ .+? @@ (.+?)(?::\d+(?:-\d+)?)?$/);
  return match?.[1] ? langFromPath(match[1].trim()) : "";
}

export function renderUnifiedDiff(
  source: string,
  width: number,
  noHighlight: boolean,
): string[] | null {
  // Strip truncation notes ("... N more line(s)") — parser treats them as invalid hunk headers.
  const cleanSource = source
    .split("\n")
    .filter((l) => !/^\.\.\. \d+ more line\(s\)/.test(l))
    .join("\n");

  // Manual parsing — bypass parsePatch which throws on format mismatches
  type DiffLine = { type: "add" | "del" | "ctx"; text: string; oldNo: number | null; newNo: number | null };
  const allLines: DiffLine[] = [];
  const hunkHeaders: { text: string; index: number }[] = [];
  let filePath = "";
  let oldNo = 1;
  let newNo = 1;

  const hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
  for (const raw of cleanSource.split("\n")) {
    if (raw.startsWith("--- ")) {
      const f = raw.slice(4).replace(/^[ab]\//, "").replace(/\t.*$/, "").trim();
      if (f && f !== "/dev/null") filePath = f;
      continue;
    }
    if (raw.startsWith("+++ ")) {
      const f = raw.slice(4).replace(/^[ab]\//, "").replace(/\t.*$/, "").trim();
      if (f && f !== "/dev/null") filePath = f;
      continue;
    }
    if (raw.startsWith("diff ") || raw.startsWith("index ") || raw.startsWith("new file") || raw.startsWith("deleted file") || raw.startsWith("similarity") || raw.startsWith("rename ") || raw.startsWith("old mode") || raw.startsWith("new mode")) continue;
    if (/^=+$/.test(raw)) continue; // separator line from createTwoFilesPatch
    const hm = raw.match(hunkRe);
    if (hm) {
      oldNo = Number(hm[1]);
      newNo = Number(hm[3]);
      hunkHeaders.push({ text: raw, index: allLines.length });
      continue;
    }
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"
    if (raw.startsWith("+")) {
      allLines.push({ type: "add", text: raw.slice(1), oldNo: null, newNo: newNo++ });
    } else if (raw.startsWith("-")) {
      allLines.push({ type: "del", text: raw.slice(1), oldNo: oldNo++, newNo: null });
    } else {
      // context line (starts with space or is empty)
      const text = raw.startsWith(" ") ? raw.slice(1) : raw;
      allLines.push({ type: "ctx", text, oldNo: oldNo++, newNo: newNo++ });
    }
  }
  if (allLines.length === 0) return null;
  const rawLanguage = langFromPath(filePath) || langFromHunkHeader(cleanSource);
  // Markdown/text highlight inside diff produces misleading colors (e.g. list items "- Codex"
  // rendered red). Plain text languages don't benefit from syntax highlight in diff context.
  const language = rawLanguage === "markdown" ? "" : rawLanguage;

  // Collect content text for Shiki highlighting (one block for accurate tokenization)
  const expandTabs = (s: string) => s.replace(/\t/g, "    ");
  const contentTexts = allLines.map((l) => expandTabs(l.text.replace(/\n$/, "")));

  // Pre-highlight the whole block once
  let preHighlighted: string[];
  if (!noHighlight && isShikiReady() && language) {
    preHighlighted = highlightBlock(contentTexts.join("\n"), language);
  } else if (!noHighlight) {
    preHighlighted = contentTexts.map((t) =>
      highlightCodeLineFallback(t.length === 0 ? " " : t, language),
    );
  } else {
    preHighlighted = contentTexts;
  }

  // Calculate gutter width from max line number
  let maxLineNo = 0;
  for (const line of allLines) {
    const n = line.type === "add" ? line.newNo : line.oldNo;
    if (n && n > maxLineNo) maxLineNo = n;
  }
  const lineNoW = maxLineNo > 0 ? Math.max(2, String(maxLineNo).length) : 0;
  const gutterWidth = lineNoW > 0 ? 1 + lineNoW + 4 : 2;
  const codeWidth = Math.max(8, width - gutterWidth);
  const out: string[] = [];

  if (filePath) out.push(`${C_GRAY}${filePath}${RESET}`);

  const hunkHeaderSet = new Map(hunkHeaders.map((h) => [h.index, h.text]));
  let lineIdx = 0;
  for (let i = 0; i < allLines.length; i++) {
    if (hunkHeaderSet.has(i)) {
      out.push(`${C_ACTION}${hunkHeaderSet.get(i)}${RESET}`);
    }
    const line = allLines[i]!;
    const isAdd = line.type === "add";
    const isDelete = line.type === "del";
    const marker = isAdd ? "+" : isDelete ? "-" : " ";
    const markerColor = isAdd ? C_SUCCESS : isDelete ? C_ERROR : C_MUTED;
    const highlighted = preHighlighted[lineIdx++] ?? "";
    const segment = fitLineSilent(highlighted, codeWidth).trimEnd();
    const bg = isAdd ? BG_DIFF_ADD : isDelete ? BG_DIFF_DELETE : "";
    let gutter: string;
    if (lineNoW > 0) {
      const lineNo = isAdd ? line.newNo : line.oldNo;
      const num = lineNo != null ? String(lineNo).padStart(lineNoW) : " ".repeat(lineNoW);
      gutter = `${markerColor}${marker}${RESET}${C_GRAY} ${num} │${RESET} `;
    } else {
      gutter = `${markerColor}${marker}${RESET} `;
    }
    if (bg) {
      const paddedCode = padToWidth(segment, codeWidth);
      const coloredCode = reapplyBackground(paddedCode, bg);
      out.push(`${gutter}${coloredCode}${RESET}`);
    } else {
      out.push(`${gutter}${segment}${RESET}`);
    }
  }

  return out;
}

class CodeMapTerminalRenderer extends TerminalRenderer {
  constructor(
    private readonly width: number,
    private readonly noHighlight: boolean,
  ) {
    super({
      reflowText: false,
      showSectionPrefix: false,
      width,
    });
  }

  code(code: unknown, lang?: string): string {
    const source = isToken(code) ? tokenText(code) : String(code ?? "");
    const language =
      isToken(code) && typeof code.lang === "string" ? code.lang : (lang ?? "");
    if (normalizeLang(language) === "diff") {
      const diffLines = renderUnifiedDiff(source, this.width, this.noHighlight);
      if (diffLines) return diffLines.join("\n") + "\n";
    }

    const separator = `${C_MUTED}${"-".repeat(Math.min(this.width, 40))}${RESET}`;
    const useShiki =
      !this.noHighlight && isShikiReady() && normalizeLang(language) !== "diff";
    const highlighted = useShiki
      ? highlightBlock(source, language)
      : source
          .split("\n")
          .map((line) =>
            this.noHighlight
              ? line
              : highlightCodeLineFallback(
                  line.length === 0 ? " " : line,
                  language,
                ),
          );
    const codeWidth = Math.max(8, this.width - 4);
    const body = highlighted.flatMap((line) =>
      wrapPlain(line, codeWidth).map((wrapped) => `    ${wrapped}${RESET}`),
    );

    return [separator, ...body, separator].join("\n") + "\n";
  }

  heading(heading: unknown, level?: number): string {
    const depth =
      isToken(heading) && typeof heading.depth === "number"
        ? heading.depth
        : (level ?? 1);
    const text = this.inlineFrom(heading);
    const color = depth <= 2 ? `${C_ACTION}${BOLD}` : `${C_AI}${BOLD}`;
    const lines = wrapPlain(text, Math.max(8, this.width - 2));
    return (
      lines
        .map((line, index) =>
          index === 0 ? `${color}${line}${RESET}` : `  ${line}`,
        )
        .join("\n") + "\n"
    );
  }

  paragraph(paragraph: unknown): string {
    const text = this.inlineFrom(paragraph);
    return wrapPlain(text, this.width).join("\n") + "\n";
  }

  list(list: unknown, ordered?: boolean): string {
    if (isToken(list) && Array.isArray(list.items)) {
      const isOrdered = Boolean(list.ordered);
      const start = typeof list.start === "number" ? list.start : 1;
      const rendered = list.items.map((item, index) => {
        const marker = isOrdered ? `${start + index}. ` : "- ";
        return this.formatListItem(marker, item as ListItemToken);
      });
      return rendered.join("\n") + "\n";
    }

    const body = String(list ?? "").trim();
    if (!body) return "";
    return (
      body
        .split("\n")
        .map((line, index) => {
          const marker = ordered ? `${index + 1}. ` : "- ";
          return this.formatListLine(marker, line);
        })
        .join("\n") + "\n"
    );
  }

  listitem(item: unknown): string {
    return this.formatListItem("- ", item as ListItemToken);
  }

  blockquote(quote: unknown): string {
    const text =
      isToken(quote) && Array.isArray(quote.tokens)
        ? this.parser.parse(quote.tokens).trim()
        : String(quote ?? "").trim();
    if (!text) return "";
    return (
      text
        .split("\n")
        .flatMap((line) =>
          wrapPlain(line.trimStart(), Math.max(8, this.width - 2)).map(
            (wrapped) =>
              wrapped ? `${C_MUTED}│${RESET} ${C_GRAY}${wrapped}${RESET}` : "",
          ),
        )
        .join("\n") + "\n"
    );
  }

  hr(): string {
    return `${C_MUTED}${"─".repeat(Math.min(this.width, 60))}${RESET}\n`;
  }

  codespan(code: unknown): string {
    return `${C_ACTION}${tokenText(code)}${RESET}`;
  }

  strong(strong: unknown): string {
    return `${BOLD}${this.inlineFrom(strong)}${RESET}`;
  }

  em(emphasis: unknown): string {
    return this.inlineFrom(emphasis);
  }

  del(deleted: unknown): string {
    return this.inlineFrom(deleted);
  }

  link(hrefOrToken: unknown, _title?: string | null, text?: string): string {
    const href =
      isToken(hrefOrToken) && typeof hrefOrToken.href === "string"
        ? hrefOrToken.href
        : String(hrefOrToken ?? "");
    const label = isToken(hrefOrToken)
      ? this.inlineFrom(hrefOrToken)
      : (text ?? href);
    if (!href || label === href) return `${C_GRAY}${label || href}${RESET}`;
    return `${label} ${C_MUTED}(${href})${RESET}`;
  }

  image(hrefOrToken: unknown, title?: string | null, text?: string): string {
    const href =
      isToken(hrefOrToken) && typeof hrefOrToken.href === "string"
        ? hrefOrToken.href
        : String(hrefOrToken ?? "");
    const label = isToken(hrefOrToken)
      ? tokenText(hrefOrToken)
      : (text ?? "image");
    const suffix = title ? ` - ${title}` : "";
    return `${C_GRAY}![${label}${suffix}]${RESET}${href ? ` ${C_MUTED}(${href})${RESET}` : ""}`;
  }

  text(text: unknown): string {
    return tokenText(text);
  }

  br(): string {
    return "\n";
  }

  html(): string {
    return "";
  }

  table(token: unknown): string {
    if (!isToken(token)) return "";
    const header = Array.isArray(token.header) ? token.header : [];
    const rows = Array.isArray(token.rows) ? token.rows : [];

    const renderCell = (cell: unknown): string => {
      if (isToken(cell) && Array.isArray(cell.tokens)) {
        return this.parser.parseInline(cell.tokens);
      }
      return tokenText(cell);
    };

    const headerTexts = (header as unknown[]).map(renderCell);
    const bodyTexts = (rows as unknown[][]).map((row) =>
      (row as unknown[]).map(renderCell),
    );

    // Compute column widths from visible content (ANSI-aware).
    const colCount = headerTexts.length;
    const colWidths = Array.from({ length: colCount }, (_, i) => {
      const candidates = [
        visibleWidth(stripAnsi(headerTexts[i] ?? "")),
        ...bodyTexts.map((row) => visibleWidth(stripAnsi(row[i] ?? ""))),
      ];
      return Math.max(3, ...candidates);
    });

    // Scale columns down if total would exceed terminal width.
    const totalNeeded = colWidths.reduce((s, w) => s + w + 3, 1);
    if (totalNeeded > this.width) {
      const available = Math.max(colCount * 3, this.width - colCount * 3 - 1);
      const total = colWidths.reduce((s, w) => s + w, 0);
      for (let i = 0; i < colWidths.length; i++) {
        colWidths[i] = Math.max(
          3,
          Math.floor(((colWidths[i] ?? 3) / total) * available),
        );
      }
    }

    const sep = (l: string, m: string, r: string): string =>
      `${C_MUTED}${l}${colWidths.map((w) => "─".repeat(w + 2)).join(m)}${r}${RESET}`;

    const renderRow = (cells: string[], isHeader: boolean): string => {
      const rendered = cells.map((text, i) => {
        const w = colWidths[i] ?? 3;
        const plain = stripAnsi(text);
        const display = isHeader ? `${BOLD}${plain}${RESET}` : text;
        const pad = Math.max(0, w - visibleWidth(plain));
        return ` ${display}${" ".repeat(pad)} `;
      });
      return `${C_MUTED}│${RESET}${rendered.join(`${C_MUTED}│${RESET}`)}${C_MUTED}│${RESET}`;
    };

    return [
      sep("┌", "┬", "┐"),
      renderRow(headerTexts, true),
      sep("├", "┼", "┤"),
      ...bodyTexts.map((row) => renderRow(row, false)),
      sep("└", "┴", "┘"),
      "",
    ].join("\n");
  }

  private inlineFrom(value: unknown): string {
    if (isToken(value) && Array.isArray(value.tokens)) {
      return this.parser.parseInline(value.tokens);
    }
    return tokenText(value);
  }

  private formatListItem(marker: string, item: ListItemToken): string {
    const checkbox = item.task ? `[${item.checked ? "x" : " "}] ` : "";
    const text = this.listItemText(item);
    return this.formatListLine(marker, `${checkbox}${text}`);
  }

  private listItemText(item: ListItemToken): string {
    if (!Array.isArray(item.tokens)) return tokenText(item);

    const inlineLines = item.tokens.map((token) => {
      if (!isToken(token) || token.type !== "text") return null;
      return Array.isArray(token.tokens)
        ? this.parser.parseInline(token.tokens)
        : tokenText(token);
    });
    if (inlineLines.every((line) => line !== null)) {
      return inlineLines.join("\n");
    }

    return this.parser.parse(item.tokens, Boolean(item.loose)).trim();
  }

  private formatListLine(marker: string, text: string): string {
    const markerWidth = visibleWidth(marker);
    const markerColor =
      marker.trim() === "-"
        ? `${C_ACTION}-${RESET} `
        : `${C_ACTION}${marker}${RESET}`;
    const continuation = " ".repeat(markerWidth);
    const bodyWidth = Math.max(8, this.width - markerWidth);
    const lines = stripTrailingBlankLines(text.split("\n"));
    const out: string[] = [];

    for (const [lineIndex, line] of lines.entries()) {
      const wrapped = wrapPlain(line, bodyWidth);
      for (const [wrapIndex, wrappedLine] of wrapped.entries()) {
        if (lineIndex === 0 && wrapIndex === 0) {
          out.push(`${markerColor}${wrappedLine}`);
        } else {
          out.push(`${continuation}${wrappedLine}`);
        }
      }
    }

    return out.join("\n");
  }
}

export function renderMarkdownish(
  text: string,
  width: number,
  options?: { noHighlight?: boolean },
): string[] {
  const renderer = new CodeMapTerminalRenderer(
    width,
    options?.noHighlight ?? false,
  );
  const rendererMethods: Record<string, (...args: unknown[]) => string> = {};
  for (const method of RENDERER_METHODS) {
    rendererMethods[method] = function (
      this: {
        options: Record<string, unknown>;
        parser: CodeMapTerminalRenderer["parser"];
      },
      ...args: unknown[]
    ) {
      renderer.options = this.options;
      renderer.parser = this.parser;
      const fn = (renderer as unknown as Record<string, unknown>)[method];
      return typeof fn === "function"
        ? (fn.apply(renderer, args) as string)
        : "";
    };
  }
  const parser = new Marked({
    async: false,
    breaks: false,
    gfm: true,
  });
  parser.use({ renderer: rendererMethods, useNewRenderer: true } as Parameters<
    Marked["use"]
  >[0]);
  const rendered = parser.parse(text) as string;
  const lines = stripTrailingBlankLines(rendered.split("\n"));

  return lines.reduce<string[]>((acc, line) => {
    if (line === "" && acc[acc.length - 1] === "") return acc;
    acc.push(line);
    return acc;
  }, []);
}
