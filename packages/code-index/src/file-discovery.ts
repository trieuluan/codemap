import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import {
  buildFileSha256,
  isBinaryBuffer,
  inferLanguage,
  inferMimeType,
  extensionFromFilename,
  readSampleBuffer,
} from "./language-utils.js";

export type RepoFileParseStatus =
  | "parsed"
  | "skipped"
  | "too_large"
  | "binary"
  | "unsupported"
  | "error";

export const IGNORED_NAMES = new Set([
  ".git",
  ".codemap",
  "node_modules",
  ".pnpm",
  ".pnpm-store",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
  ".agents",
  ".claude",
  ".codex",
  ".vercel",
  "tmp",
  "temp",
  ".continue",
  ".github",
  ".vscode",
  ".cursor",
  ".opencode",
  ".windsurf",
  ".zed",
  ".gemini",
  ".ideamrc",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
]);

// ponytail: removed lib/, dist/, build/ — these are gitignore's domain (lib/ is source in Ruby/Dart/Elixir)

async function loadGitignoreMatcher(workspacePath: string) {
  const matcher = ignore();
  try {
    matcher.add(await readFile(path.join(workspacePath, ".gitignore"), "utf8"));
  } catch {
    // no root .gitignore
  }
  return matcher;
}

async function walkDir(
  dirPath: string,
  workspacePath: string,
  gitignoreMatcher: ReturnType<typeof ignore>,
  onFile: (relativePath: string, absolutePath: string) => Promise<void>,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(dirPath, entry.name);
    const rel = path.relative(workspacePath, abs).split(path.sep).join("/");
    const relForMatcher = entry.isDirectory() ? `${rel}/` : rel;

    if (entry.isDirectory()) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      if (gitignoreMatcher.ignores(relForMatcher)) continue;
      await walkDir(abs, workspacePath, gitignoreMatcher, onFile);
    } else if (entry.isFile()) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      if (gitignoreMatcher.ignores(relForMatcher)) continue;
      await onFile(rel, abs);
    }
  }
}

/** Helper to check if a path should be ignored */
export function isPathIgnored(path: string): boolean {
  const parts = path.split("/");
  return parts.some((part) => IGNORED_NAMES.has(part));
}

export const MAX_PARSE_BYTES = 2 * 1024 * 1024;
export const MAX_PARSE_BYTES_BY_LANGUAGE: Partial<Record<string, number>> = {
  Gettext: 10 * 1024 * 1024,
};

export const PARSE_TOOL_NAME = "codemap-regex-parser";
export const PARSE_TOOL_VERSION = "0.1.0";

export interface WorkspaceFileCandidate {
  path: string;
  absolutePath: string;
  dirPath: string;
  baseName: string;
  extension: string | null;
  language: string | null;
  mimeType: string | null;
  sizeBytes: number;
  contentSha256: string | null;
  isText: boolean;
  isBinary: boolean;
  isGenerated: boolean;
  isIgnored: boolean;
  ignoreReason: string | null;
  isParseable: boolean;
  parseStatus: RepoFileParseStatus;
  parserName: string | null;
  parserVersion: string | null;
  lineCount: number | null;
  content: string | null;
}

export function normalizeRepositoryFilePath(input: string) {
  const normalizedPath = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const resolvedPath = path.posix.normalize(normalizedPath);

  if (!resolvedPath || resolvedPath === "." || resolvedPath.startsWith("../")) {
    throw new Error("File path must stay within the repository root");
  }

  return resolvedPath;
}

/**
 * Collect a single file as a WorkspaceFileCandidate.
 * Returns null if the file doesn't exist, is a symlink, or is in an ignored directory.
 */
export async function collectSingleFile(
  relativePath: string,
  workspacePath: string,
): Promise<WorkspaceFileCandidate | null> {
  const absolutePath = path.join(workspacePath, relativePath);

  try {
    const entryStats = await lstat(absolutePath);
    
    // Skip symlinks
    if (entryStats.isSymbolicLink() || !entryStats.isFile()) return null;

    // Check if any parent directory is in IGNORED_NAMES
    const parts = relativePath.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      if (IGNORED_NAMES.has(parts[i])) return null;
    }

    const name = path.basename(absolutePath);
    const extension = extensionFromFilename(name);
    const language = inferLanguage(extension);
    const mimeType = inferMimeType(extension);
    const sample = await readSampleBuffer(absolutePath, entryStats.size);
    const isBinary = isBinaryBuffer(sample);
    const isText = !isBinary;
    const maxParseBytes = (language ? MAX_PARSE_BYTES_BY_LANGUAGE[language] : undefined) ?? MAX_PARSE_BYTES;
    const isParseable = Boolean(language) && isText && entryStats.size <= maxParseBytes;
    const normalizedPath = normalizeRepositoryFilePath(relativePath);
    const dirPath = path.posix.dirname(normalizedPath) === "."
      ? ""
      : path.posix.dirname(normalizedPath);

    if (!isParseable) {
      return {
        path: normalizedPath,
        absolutePath,
        dirPath,
        baseName: name,
        extension,
        language,
        mimeType,
        sizeBytes: entryStats.size,
        contentSha256: null,
        isText,
        isBinary,
        isGenerated: false,
        isIgnored: false,
        ignoreReason: null,
        isParseable: false,
        parseStatus: isBinary ? "binary" : entryStats.size > MAX_PARSE_BYTES ? "too_large" : "unsupported",
        parserName: null,
        parserVersion: null,
        lineCount: null,
        content: null,
      };
    }

    const content = await readFile(absolutePath, "utf8");

    return {
      path: normalizedPath,
      absolutePath,
      dirPath,
      baseName: name,
      extension,
      language,
      mimeType,
      sizeBytes: entryStats.size,
      contentSha256: buildFileSha256(content),
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: PARSE_TOOL_NAME,
      parserVersion: PARSE_TOOL_VERSION,
      lineCount: content.split(/\r?\n/).length,
      content,
    };
  } catch {
    return null;
  }
}

export async function collectWorkspaceFiles(
  workspacePath: string,
): Promise<WorkspaceFileCandidate[]> {
  const gitignoreMatcher = await loadGitignoreMatcher(workspacePath);
  const candidates: WorkspaceFileCandidate[] = [];

  async function onFile(relativePath: string, absolutePath: string) {
    const entryStats = await lstat(absolutePath);
    const name = path.basename(absolutePath);
    const extension = extensionFromFilename(name);
    const language = inferLanguage(extension);
    const mimeType = inferMimeType(extension);
    const sample = await readSampleBuffer(absolutePath, entryStats.size);
    const isBinary = isBinaryBuffer(sample);
    const isText = !isBinary;
    const maxParseBytes =
      (language ? MAX_PARSE_BYTES_BY_LANGUAGE[language] : undefined) ??
      MAX_PARSE_BYTES;
    const isParseable =
      Boolean(language) && isText && entryStats.size <= maxParseBytes;

    const normalizedPath = normalizeRepositoryFilePath(relativePath);
    const dirPath =
      path.posix.dirname(normalizedPath) === "."
        ? ""
        : path.posix.dirname(normalizedPath);

    if (!isParseable) {
      candidates.push({
        path: normalizedPath,
        absolutePath,
        dirPath,
        baseName: name,
        extension,
        language,
        mimeType,
        sizeBytes: entryStats.size,
        contentSha256: null,
        isText,
        isBinary,
        isGenerated: false,
        isIgnored: false,
        ignoreReason: null,
        isParseable: false,
        parseStatus: isBinary
          ? "binary"
          : entryStats.size > MAX_PARSE_BYTES
            ? "too_large"
            : "unsupported",
        parserName: null,
        parserVersion: null,
        lineCount: null,
        content: null,
      });
      return;
    }

    const content = await readFile(absolutePath, "utf8");
    candidates.push({
      path: normalizedPath,
      absolutePath,
      dirPath,
      baseName: name,
      extension,
      language,
      mimeType,
      sizeBytes: entryStats.size,
      contentSha256: buildFileSha256(content),
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: PARSE_TOOL_NAME,
      parserVersion: PARSE_TOOL_VERSION,
      lineCount: content.split(/\r?\n/).length,
      content,
    });
  }

  await walkDir(workspacePath, workspacePath, gitignoreMatcher, onFile);
  return candidates.sort((l, r) => l.path.localeCompare(r.path));
}
