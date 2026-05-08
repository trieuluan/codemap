import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { readWorkspacePath } from "../../lib/workspace-project.js";

const MAX_FILE_CHARS = 24_000;
const MAX_TOTAL_CHARS = 60_000;
const MAX_MENTIONED_FILES = 8;

export interface MentionContextResult {
  content: string;
  files: string[];
  warnings: string[];
}

export async function hydrateMentionContext(
  message: string,
): Promise<MentionContextResult> {
  const mentions = extractFileMentions(message).slice(0, MAX_MENTIONED_FILES);
  if (mentions.length === 0) {
    return { content: message, files: [], warnings: [] };
  }

  const workspacePath = await readWorkspacePath();
  const files: string[] = [];
  const warnings: string[] = [];
  const blocks: string[] = [];
  let totalChars = 0;

  for (const mentionPath of mentions) {
    const safePath = normalizeMentionPath(mentionPath);
    if (!safePath) {
      warnings.push(`Skipped unsafe file mention: ${mentionPath}`);
      continue;
    }

    const absolutePath = path.join(workspacePath, safePath);
    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        warnings.push(`Mention is not a file: ${safePath}`);
        continue;
      }

      const raw = await readFile(absolutePath, "utf8");
      const remaining = MAX_TOTAL_CHARS - totalChars;
      if (remaining <= 0) {
        warnings.push("Skipped remaining file mentions because context is full.");
        break;
      }

      const limit = Math.min(MAX_FILE_CHARS, remaining);
      const content = raw.length > limit ? raw.slice(0, limit) : raw;
      totalChars += content.length;
      files.push(safePath);
      blocks.push(formatFileBlock(safePath, content, raw.length > limit));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not read ${safePath}: ${message}`);
    }
  }

  if (blocks.length === 0) {
    return { content: message, files, warnings };
  }

  return {
    content: `${message}\n\n${formatContextBlock(blocks)}`,
    files,
    warnings,
  };
}

export function extractFileMentions(message: string): string[] {
  const matches = message.matchAll(/@([^\s`"'<>]+)/g);
  const seen = new Set<string>();
  const mentions: string[] = [];

  for (const match of matches) {
    const mention = stripTrailingPunctuation(match[1] ?? "");
    if (!mention || seen.has(mention)) continue;
    seen.add(mention);
    mentions.push(mention);
  }

  return mentions;
}

function normalizeMentionPath(input: string): string | null {
  const normalized = path.posix.normalize(input.replace(/\\/g, "/"));
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/")
  ) {
    return null;
  }
  return normalized;
}

function stripTrailingPunctuation(input: string) {
  return input.replace(/[.,;:!?]+$/, "");
}

function formatContextBlock(blocks: string[]) {
  return `<mentioned_files>\n${blocks.join("\n\n")}\n</mentioned_files>`;
}

function formatFileBlock(filePath: string, content: string, truncated: boolean) {
  const suffix = truncated ? "\n\n[truncated]" : "";
  return `<file path="${escapeAttribute(filePath)}">\n${content}${suffix}\n</file>`;
}

function escapeAttribute(input: string) {
  return input.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
