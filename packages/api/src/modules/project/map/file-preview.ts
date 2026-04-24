import { createReadStream } from "node:fs";
import { open, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import type { ProjectTreeNode } from "./tree-builder";

export type ProjectFilePreviewStatus =
  | "ready"
  | "binary"
  | "too_large"
  | "unsupported"
  | "unavailable";

export type ProjectFilePreviewKind = "text" | "image" | "binary";

export interface ProjectFilePreviewResult {
  path: string;
  name: string;
  type: "file" | "directory";
  extension: string | null;
  language: string | null;
  kind: ProjectFilePreviewKind;
  mimeType: string | null;
  status: ProjectFilePreviewStatus;
  content: string | null;
  sizeBytes: number | null;
  reason: string | null;
}

export interface ProjectRawImageFileResult {
  absoluteFilePath: string;
  mimeType: string;
  sizeBytes: number;
}

const MAX_PREVIEW_BYTES = 500 * 1024;
const BINARY_SAMPLE_BYTES = 8192;
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

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

function normalizeExtension(extension?: string | null) {
  return extension?.trim().toLowerCase() || null;
}

function inferMimeType(extension?: string | null) {
  const normalizedExtension = normalizeExtension(extension);

  if (!normalizedExtension) {
    return null;
  }

  const imageMimeType = IMAGE_MIME_TYPES[normalizedExtension];

  if (imageMimeType) {
    return imageMimeType;
  }

  switch (normalizedExtension) {
    case "json":
      return "application/json";
    case "yml":
    case "yaml":
      return "application/yaml";
    case "toml":
      return "application/toml";
    case "md":
      return "text/markdown";
    case "css":
      return "text/css";
    case "scss":
    case "sass":
    case "less":
      return "text/plain";
    case "html":
      return "text/html";
    case "js":
    case "jsx":
      return "text/javascript";
    case "ts":
    case "tsx":
      return "text/plain";
    default:
      return null;
  }
}

export function isPreviewableImageExtension(extension?: string | null) {
  const normalizedExtension = normalizeExtension(extension);

  return normalizedExtension ? normalizedExtension in IMAGE_MIME_TYPES : false;
}

function getPreviewMetadata(
  node: Pick<ProjectTreeNode, "name" | "path" | "type" | "extension">,
) {
  return {
    path: node.path,
    name: node.name,
    type: node.type === "directory" ? "directory" : "file",
    extension: node.extension ?? null,
    language: inferLanguageLabel(node.extension),
    kind: node.type === "directory" ? "binary" : "text",
    mimeType: inferMimeType(node.extension),
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
    kind: "binary",
    mimeType: inferMimeType(input.extension),
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
    kind: "binary",
    content: null,
    status,
    sizeBytes: sizeBytes ?? null,
    reason,
  };
}

export function normalizeRepositoryFilePath(input: string) {
  const normalizedPath = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
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

function resolveWorkspaceFilePath(
  workspacePath: string,
  repositoryPath: string,
) {
  const absoluteFilePath = path.resolve(
    workspacePath,
    ...repositoryPath.split("/"),
  );
  const normalizedWorkspaceRoot = path.resolve(workspacePath);

  if (
    absoluteFilePath !== normalizedWorkspaceRoot &&
    !absoluteFilePath.startsWith(`${normalizedWorkspaceRoot}${path.sep}`)
  ) {
    throw new Error("Resolved file path escapes the repository workspace");
  }

  return absoluteFilePath;
}

async function getWorkspaceFileStats(
  workspacePath: string,
  treeNode: ProjectTreeNode,
) {
  const absoluteFilePath = resolveWorkspaceFilePath(
    workspacePath,
    treeNode.path,
  );
  const fileStats = await stat(absoluteFilePath);

  return { absoluteFilePath, fileStats };
}

export async function getProjectFilePreview(input: {
  workspacePath: string;
  treeNode: ProjectTreeNode;
  startLine?: number;
  endLine?: number;
}): Promise<ProjectFilePreviewResult> {
  const metadata = getPreviewMetadata(input.treeNode);

  if (input.treeNode.type === "directory") {
    return buildBlockedPreview(
      input.treeNode,
      "unsupported",
      "Directories cannot be previewed as file content.",
    );
  }

  try {
    const { absoluteFilePath, fileStats } = await getWorkspaceFileStats(
      input.workspacePath,
      input.treeNode,
    );

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

    if (isPreviewableImageExtension(input.treeNode.extension)) {
      return {
        ...metadata,
        kind: "image",
        mimeType: inferMimeType(input.treeNode.extension),
        status: "ready",
        content:
          input.treeNode.extension === "svg"
            ? await readFile(absoluteFilePath, "utf8")
            : null,
        sizeBytes: fileStats.size,
        reason: null,
      };
    }

    const sampleBuffer = await readSampleBuffer(
      absoluteFilePath,
      fileStats.size,
    );

    if (isBinaryBuffer(sampleBuffer)) {
      return buildBlockedPreview(
        input.treeNode,
        "binary",
        "This file appears to be binary and cannot be previewed as text.",
        fileStats.size,
      );
    }

    let content = await readFile(absoluteFilePath, "utf8");

    if (input.startLine !== undefined || input.endLine !== undefined) {
      const allLines = content.split(/\r?\n/);
      const from = Math.max((input.startLine ?? 1) - 1, 0);
      const to = Math.min(input.endLine ?? allLines.length, allLines.length);
      content = allLines.slice(from, to).join("\n");
    }

    return {
      ...metadata,
      kind: "text",
      mimeType: inferMimeType(input.treeNode.extension),
      status: "ready",
      content,
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

export async function getProjectRawImageFile(input: {
  workspacePath: string;
  treeNode: ProjectTreeNode;
}): Promise<ProjectRawImageFileResult> {
  if (input.treeNode.type === "directory") {
    throw new Error("Directories cannot be previewed as raw files.");
  }

  if (!isPreviewableImageExtension(input.treeNode.extension)) {
    throw new Error("Only previewable image files support raw preview access.");
  }

  const { absoluteFilePath, fileStats } = await getWorkspaceFileStats(
    input.workspacePath,
    input.treeNode,
  );

  if (!fileStats.isFile()) {
    throw new Error("Only regular files can be previewed.");
  }

  if (fileStats.size > MAX_PREVIEW_BYTES) {
    throw new Error("This file is too large to preview in the browser.");
  }

  const mimeType = inferMimeType(input.treeNode.extension);

  if (!mimeType) {
    throw new Error("Unable to determine a previewable image content type.");
  }

  return {
    absoluteFilePath,
    mimeType,
    sizeBytes: fileStats.size,
  };
}

export function createProjectRawImageReadStream(filePath: string) {
  return createReadStream(filePath);
}
