import type { Highlighter } from "shiki";
import { RESET } from "./theme.js";

const THEME = "github-dark";

const LANGS = [
  "typescript", "javascript", "dart", "php",
  "python", "java", "kotlin", "json", "bash", "diff",
  "sql", "markdown", "yaml", "toml", "html", "css",
  "rust", "go", "ruby", "swift", "c", "cpp", "vue",
] as const;

const LANG_ALIASES: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript",
  mjs: "javascript", cjs: "javascript",
  shell: "bash", sh: "bash",
  kt: "kotlin", kts: "kotlin",
  py: "python",
  jsonc: "json",
  md: "markdown", mdx: "markdown",
  yml: "yaml",
  rs: "rust",
  rb: "ruby",
  cs: "c", // C# approximation
};

let highlighter: Highlighter | null = null;
let initPromise: Promise<void> | null = null;

export async function initShiki(): Promise<void> {
  if (highlighter || initPromise) return;
  initPromise = (async () => {
    const { createHighlighter } = await import("shiki");
    highlighter = await createHighlighter({ themes: [THEME], langs: [...LANGS] });
  })();
  return initPromise;
}

function hexToAnsi(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function resolveLang(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  const resolved = LANG_ALIASES[lower] ?? lower;
  return LANGS.includes(resolved as typeof LANGS[number]) ? resolved : null;
}

export function highlightBlock(code: string, rawLang: string): string[] {
  const lang = resolveLang(rawLang);
  if (!highlighter || !lang) return code.split("\n");

  try {
    const tokenLines = highlighter.codeToTokensBase(code, { lang: lang as Parameters<typeof highlighter.codeToTokensBase>[1]["lang"], theme: THEME });
    return tokenLines.map((tokens) => {
      if (tokens.length === 0) return "";
      return tokens.map((t) =>
        t.color ? `${hexToAnsi(t.color)}${t.content}${RESET}` : t.content,
      ).join("") + RESET;
    });
  } catch {
    return code.split("\n");
  }
}

export function isShikiReady(): boolean {
  return highlighter !== null;
}
