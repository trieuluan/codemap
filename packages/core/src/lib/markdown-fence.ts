export interface MarkdownFenceInput {
  extension?: string | null;
  language?: string | null;
  path?: string | null;
}

const FENCE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cjs: "js",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  dart: "dart",
  go: "go",
  h: "c",
  hpp: "cpp",
  html: "html",
  java: "java",
  js: "js",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  md: "md",
  mdx: "mdx",
  mjs: "js",
  php: "php",
  py: "py",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  ts: "ts",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

const FENCE_LANGUAGE_BY_NAME: Record<string, string> = {
  bash: "bash",
  c: "c",
  "c#": "csharp",
  csharp: "csharp",
  "c++": "cpp",
  cpp: "cpp",
  css: "css",
  dart: "dart",
  go: "go",
  html: "html",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsonc: "jsonc",
  kotlin: "kotlin",
  markdown: "md",
  md: "md",
  php: "php",
  python: "py",
  py: "py",
  ruby: "ruby",
  rust: "rust",
  shell: "bash",
  sh: "bash",
  sql: "sql",
  swift: "swift",
  text: "text",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
};

function normalizeExtension(extension?: string | null): string | null {
  const normalized = extension?.trim().toLowerCase().replace(/^\./, "");
  return normalized || null;
}

function extensionFromPath(path?: string | null): string | null {
  const clean = path?.trim().split("?")[0]?.replace(/^[ab]\//, "");
  const extension = clean?.split(".").pop();
  return normalizeExtension(extension);
}

function normalizeLanguage(language?: string | null): string | null {
  const normalized = language?.trim().toLowerCase();
  return normalized || null;
}

export function markdownFenceLanguage(input: MarkdownFenceInput): string {
  const extension =
    normalizeExtension(input.extension) ?? extensionFromPath(input.path);
  const language = normalizeLanguage(input.language);

  return (
    (extension ? FENCE_LANGUAGE_BY_EXTENSION[extension] : undefined) ??
    (language ? FENCE_LANGUAGE_BY_NAME[language] : undefined) ??
    ""
  );
}

export function markdownFenceStart(input: MarkdownFenceInput): string {
  return `\`\`\`${markdownFenceLanguage(input)}`;
}
