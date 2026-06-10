/**
 * Read extra agent convention files directly from disk.
 *
 * Mastra Code's `buildFullPrompt()` already reads AGENTS.md and CLAUDE.md
 * from the project root. This module supplements that by loading conventions
 * from other agent tools (Cursor, Cline, Windsurf, Copilot) that Mastra
 * Code does not handle natively.
 *
 * No LLM synthesis — files are returned as-is.
 */

import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";

// ─── Source definitions ───────────────────────────────────

/** Convention sources that Mastra Code does NOT read natively. */
const EXTRA_CONVENTION_SOURCES: Array<{ label: string; paths: string[] }> = [
  { label: "Cursor",         paths: [".cursorrules", ".cursor/rules/*.mdc"] },
  { label: "Windsurf",       paths: [".windsurfrules"] },
  { label: "GitHub Copilot", paths: [".github/copilot-instructions.md"] },
  { label: "Cline",          paths: [".clinerules"] },
  { label: "General",        paths: ["CONVENTIONS.md"] },
];

const EXTRA_RULE_SOURCES: Array<{ label: string; paths: string[] }> = [
  { label: "Cursor rules",   paths: [".cursor/rules/*.mdc"] },
];

// ─── Types ────────────────────────────────────────────────

export interface ExtraConventions {
  conventions: string | null;
  rules: string | null;
}

interface ScannedFile {
  label: string;
  filePath: string;
  content: string;
}

// ─── Glob expansion ───────────────────────────────────────

async function expandGlob(root: string, pattern: string): Promise<string[]> {
  if (!pattern.includes("*")) {
    try {
      await stat(path.join(root, pattern));
      return [pattern];
    } catch {
      return [];
    }
  }

  const parts = pattern.split("/");
  const starIdx = parts.findIndex((p) => p.includes("*"));
  const parentDir = parts.slice(0, starIdx).join("/") || ".";
  const starPart = parts[starIdx]!;
  const rest = parts.slice(starIdx + 1).join("/");

  let entries: string[];
  try {
    entries = await readdir(path.join(root, parentDir));
  } catch {
    return [];
  }

  const results: string[] = [];
  const ext = path.extname(rest || starPart).replace("*", "");

  for (const e of entries) {
    if (!ext || e.endsWith(ext)) {
      results.push(
        [parentDir === "." ? "" : parentDir, e].filter(Boolean).join("/"),
      );
    }
  }
  return results;
}

// ─── Scanner ──────────────────────────────────────────────

async function scanSources(
  root: string,
  sources: Array<{ label: string; paths: string[] }>,
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];

  for (const { label, paths } of sources) {
    for (const pattern of paths) {
      for (const rel of await expandGlob(root, pattern)) {
        try {
          const content = await readFile(path.join(root, rel), "utf8");
          if (content.trim()) {
            results.push({ label, filePath: rel, content });
          }
        } catch {
          // skip unreadable
        }
      }
    }
  }

  return results;
}

// ─── Formatting ───────────────────────────────────────────

function formatScannedFiles(files: ScannedFile[]): string | null {
  if (files.length === 0) return null;
  return files
    .map((f) => `=== ${f.label}: ${f.filePath} ===\n${f.content}`)
    .join("\n\n");
}

// ─── Public API ───────────────────────────────────────────

/**
 * Load extra agent conventions directly from disk.
 *
 * Returns raw file contents concatenated — no LLM synthesis.
 * Returns `{ conventions: null, rules: null }` if no files found.
 */
export async function loadExtraConventions(
  projectPath: string,
): Promise<ExtraConventions> {
  const [conventionFiles, ruleFiles] = await Promise.all([
    scanSources(projectPath, EXTRA_CONVENTION_SOURCES),
    scanSources(projectPath, EXTRA_RULE_SOURCES),
  ]);

  return {
    conventions: formatScannedFiles(conventionFiles),
    rules: formatScannedFiles(ruleFiles),
  };
}
