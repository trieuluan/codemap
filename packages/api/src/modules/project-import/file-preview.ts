import { open, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import type { ProjectTreeNode } from "./tree-builder";

export type ProjectFilePreviewStatus =
  | "ready"
  | "binary"
  | "too_large"
  | "unsupported"
  | "unavailable";

export interface ProjectFilePreviewResult {
  path: string;
  name: string;
  type: "file" | "directory";
  extension: string | null;
  language: string | null;
  status: ProjectFilePreviewStatus;
  content: string | null;
  sizeBytes: number | null;
  reason: string | null;
}

const MAX_PREVIEW_BYTES = 200 * 1024;
const BINARY_SAMPLE_BYTES = 8192;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  md: "Markdown",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  html: "HTML",
  svg: "SVG",
};

function inferLanguageLabel(extension?: string | null) {
  if (!extension) {
    return null;
  }

  return LANGUAGE_BY_EXTENSION[extension.toLowerCase()] ?? null;
}

function getPreviewMetadata(node: Pick<ProjectTreeNode, "name" | "path" | "type" | "extension">) {
  return {
    path: node.path,
    name: node.name,
    type: node.type === "directory" ? "directory" : "file",
    extension: node.extension ?? null,
    language: inferLanguageLabel(node.extension),
  } as const;
}

export function buildUnavailableFilePreview(input: {
  path: string;
  name?: string;
  extension?: string | null;
  reason: string;
}): ProjectFilePreviewResult {
  return {
    path: input.path,
    name: input.name ?? path.basename(input.path),
    type: "file",
    extension: input.extension ?? null,
    language: inferLanguageLabel(input.extension),
    status: "unavailable",
    content: null,
    sizeBytes: null,
    reason: input.reason,
  };
}

function buildBlockedPreview(
  node: Pick<ProjectTreeNode, "name" | "path" | "type" | "extension">,
  status: Exclude<ProjectFilePreviewStatus, "ready">,
  reason: string,
  sizeBytes?: number | null,
): ProjectFilePreviewResult {
  const metadata = getPreviewMetadata(node);

  return {
    ...metadata,
    content: null,
    status,
    sizeBytes: sizeBytes ?? null,
    reason,
  };
}

export function normalizeRepositoryFilePath(input: string) {
  const normalizedPath = input
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const resolvedPath = path.posix.normalize(normalizedPath);

  if (!resolvedPath || resolvedPath === "." || resolvedPath.startsWith("../")) {
    throw new Error("File path must stay within the repository root");
  }

  return resolvedPath;
}

function isBinaryBuffer(buffer: Buffer) {
  if (buffer.length === 0) {
    return false;
  }

  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }
  }

  return false;
}

async function readSampleBuffer(filePath: string, size: number) {
  const fileHandle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(Math.min(size, BINARY_SAMPLE_BYTES));
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0);

    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

export async function getProjectFilePreview(input: {
  workspacePath: string;
  treeNode: ProjectTreeNode;
}): Promise<ProjectFilePreviewResult> {
  const metadata = getPreviewMetadata(input.treeNode);

  if (input.treeNode.type === "directory") {
    return buildBlockedPreview(
      input.treeNode,
      "unsupported",
      "Directories cannot be previewed as file content.",
    );
  }

  const absoluteFilePath = path.resolve(
    input.workspacePath,
    ...input.treeNode.path.split("/"),
  );
  const normalizedWorkspaceRoot = path.resolve(input.workspacePath);

  if (
    absoluteFilePath !== normalizedWorkspaceRoot &&
    !absoluteFilePath.startsWith(`${normalizedWorkspaceRoot}${path.sep}`)
  ) {
    throw new Error("Resolved file path escapes the repository workspace");
  }

  try {
    const fileStats = await stat(absoluteFilePath);

    if (!fileStats.isFile()) {
      return buildBlockedPreview(
        input.treeNode,
        "unsupported",
        "Only regular files can be previewed.",
      );
    }

    if (fileStats.size > MAX_PREVIEW_BYTES) {
      return buildBlockedPreview(
        input.treeNode,
        "too_large",
        "This file is too large to preview in the browser.",
        fileStats.size,
      );
    }

    const sampleBuffer = await readSampleBuffer(absoluteFilePath, fileStats.size);

    if (isBinaryBuffer(sampleBuffer)) {
      return buildBlockedPreview(
        input.treeNode,
        "binary",
        "This file appears to be binary and cannot be previewed as text.",
        fileStats.size,
      );
    }

    return {
      ...metadata,
      status: "ready",
      content: await readFile(absoluteFilePath, "utf8"),
      sizeBytes: fileStats.size,
      reason: null,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return buildBlockedPreview(
        input.treeNode,
        "unavailable",
        "This file is not available in the retained repository workspace.",
      );
    }

    throw error;
  }
}
