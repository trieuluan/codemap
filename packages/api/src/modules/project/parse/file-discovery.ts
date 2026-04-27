import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { normalizeRepositoryFilePath } from "../map/file-preview";
import type { RepoFileInsert } from "../../../db/schema";
import {
  buildFileSha256,
  isBinaryBuffer,
  inferLanguage,
  inferMimeType,
  normalizeExtension,
  readSampleBuffer,
} from "./language-utils";

export const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
]);

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
  parseStatus: RepoFileInsert["parseStatus"];
  parserName: string | null;
  parserVersion: string | null;
  lineCount: number | null;
  content: string | null;
}

export async function collectWorkspaceFiles(
  workspacePath: string,
): Promise<WorkspaceFileCandidate[]> {
  const candidates: WorkspaceFileCandidate[] = [];

  async function visit(absolutePath: string) {
    const entryStats = await lstat(absolutePath);

    if (entryStats.isSymbolicLink()) return;

    const name = path.basename(absolutePath);

    if (entryStats.isDirectory()) {
      if (IGNORED_NAMES.has(name)) return;

      const entries = await readdir(absolutePath, { withFileTypes: true });
      for (const entry of entries) {
        await visit(path.join(absolutePath, entry.name));
      }
      return;
    }

    if (!entryStats.isFile()) return;

    const relativePath = normalizeRepositoryFilePath(
      path.relative(workspacePath, absolutePath).split(path.sep).join("/"),
    );
    const extension = normalizeExtension(name);
    const language = inferLanguage(extension);
    const mimeType = inferMimeType(extension);
    const sample = await readSampleBuffer(absolutePath, entryStats.size);
    const isBinary = isBinaryBuffer(sample);
    const isText = !isBinary;
    const maxParseBytes = (language ? MAX_PARSE_BYTES_BY_LANGUAGE[language] : undefined) ?? MAX_PARSE_BYTES;
    const isParseable = Boolean(language) && isText && entryStats.size <= maxParseBytes;

    const dirPath = path.posix.dirname(relativePath) === "."
      ? ""
      : path.posix.dirname(relativePath);

    if (!isParseable) {
      candidates.push({
        path: relativePath,
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
      path: relativePath,
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

  await visit(workspacePath);
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}
