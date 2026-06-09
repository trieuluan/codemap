import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";

export const SOURCE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  // Source code — parsers available
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  dart: "Dart",
  php: "PHP",
  py: "Python",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  po: "Gettext",
  // Source code — no parser yet, language label only
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  cs: "C#",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  swift: "Swift",
  lua: "Lua",
  r: "R",
  scala: "Scala",
  groovy: "Groovy",
  ex: "Elixir",
  exs: "Elixir",
  erl: "Erlang",
  hs: "Haskell",
  clj: "Clojure",
  fs: "F#",
  fsx: "F#",
  // Data / config / markup
  json: "JSON",
  jsonc: "JSON",
  json5: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  md: "Markdown",
  mdx: "MDX",
  rst: "reStructuredText",
  svg: "SVG",
  csv: "CSV",
  tsv: "TSV",
  sql: "SQL",
  graphql: "GraphQL",
  gql: "GraphQL",
  proto: "Protocol Buffers",
  // Shell / infra
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  fish: "Shell",
  ps1: "PowerShell",
  bat: "Batch",
  cmd: "Batch",
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  cmake: "CMake",
  // Other text
  env: "dotenv",
  ini: "INI",
  cfg: "Config",
  conf: "Config",
  txt: "Text",
  log: "Log",
  diff: "Diff",
  patch: "Patch",
};

export const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  // Source code
  ts: "text/plain",
  tsx: "text/plain",
  js: "text/javascript",
  jsx: "text/javascript",
  dart: "text/plain",
  php: "text/x-php",
  java: "text/x-java-source",
  kt: "text/x-kotlin",
  kts: "text/x-kotlin",
  c: "text/x-c",
  h: "text/x-c",
  cpp: "text/x-c++",
  cc: "text/x-c++",
  cxx: "text/x-c++",
  cs: "text/x-csharp",
  go: "text/x-go",
  rs: "text/x-rust",
  rb: "text/x-ruby",
  swift: "text/x-swift",
  lua: "text/x-lua",
  scala: "text/x-scala",
  ex: "text/x-elixir",
  exs: "text/x-elixir",
  hs: "text/x-haskell",
  // Data / config / markup
  json: "application/json",
  jsonc: "application/json",
  json5: "application/json",
  yaml: "text/yaml",
  yml: "text/yaml",
  toml: "application/toml",
  xml: "text/xml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  scss: "text/x-scss",
  sass: "text/x-sass",
  less: "text/x-less",
  md: "text/markdown",
  mdx: "text/markdown",
  svg: "image/svg+xml",
  csv: "text/csv",
  sql: "application/sql",
  graphql: "application/graphql",
  gql: "application/graphql",
  // Shell / infra
  sh: "text/x-shellscript",
  bash: "text/x-shellscript",
  zsh: "text/x-shellscript",
  fish: "text/x-shellscript",
  ps1: "text/x-powershell",
  // Other text
  env: "text/plain",
  ini: "text/plain",
  txt: "text/plain",
  log: "text/plain",
  diff: "text/plain",
};

export const BINARY_SAMPLE_BYTES = 8192;

/**
 * Extract extension from a filename and normalize it.
 * @example extensionFromFilename("file.TS") → "ts"
 */
export function extensionFromFilename(fileName: string) {
  const extension = path.extname(fileName).slice(1).trim().toLowerCase();
  return extension || null;
}

/**
 * Normalize an extension string, or extract + normalize from a filename.
 * Accepts both "file.ts" (filename) and "ts" / ".TS" (extension string).
 * @example normalizeExtension("file.TS") → "ts"
 * @example normalizeExtension(".TS") → "ts"
 * @example normalizeExtension("ts") → "ts"
 */
export function normalizeExtension(input: string): string | null {
  const value = input.includes(".")
    ? path.extname(input).slice(1)
    : input;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function inferLanguage(extension: string | null) {
  if (!extension) return null;
  return SOURCE_LANGUAGE_BY_EXTENSION[extension] ?? null;
}

export function inferMimeType(extension: string | null) {
  if (!extension) return null;
  return MIME_TYPE_BY_EXTENSION[extension] ?? null;
}

export function isBinaryBuffer(buffer: Buffer) {
  for (const byte of buffer) {
    if (byte === 0) return true;
  }
  return false;
}

export async function readSampleBuffer(filePath: string, sizeBytes: number) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(Math.min(sizeBytes, BINARY_SAMPLE_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function buildFileSha256(content: Buffer | string) {
  return createHash("sha256").update(content).digest("hex");
}
