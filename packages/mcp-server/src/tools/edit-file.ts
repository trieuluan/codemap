import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

// ─── types ───────────────────────────────────────────────────────────────────

interface EditFileResult {
  applied: boolean;
  dryRun: boolean;
  filePath: string;
  replacements: number;
  error?: string;
  [key: string]: unknown;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function validateUniqueMatch(
  content: string,
  oldString: string,
): { ok: true; count: number } | { ok: false; count: number; error: string } {
  const count = countOccurrences(content, oldString);
  if (count === 0) {
    return {
      ok: false,
      count: 0,
      error:
        "old_string not found in file. Make sure it matches the file content exactly, including whitespace and indentation.",
    };
  }
  if (count > 1) {
    return {
      ok: false,
      count,
      error: `old_string matches ${count} locations in the file. Provide more surrounding context to make it unique, or use replace_all to replace every occurrence.`,
    };
  }
  return { ok: true, count: 1 };
}

function buildDiffPreview(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string {
  const lines = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1 +1 @@`,
  ];

  const oldLines = oldString.split("\n");
  const newLines = newString.split("\n");
  for (const line of oldLines) lines.push(`-${line}`);
  for (const line of newLines) lines.push(`+${line}`);

  if (replaceAll) {
    lines.push("", "(all occurrences will be replaced)");
  }

  return lines.join("\n");
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerEditFileTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "edit_file",
    {
      title: "Edit File",
      description:
        "Replace `old_string` with `new_string` in a file. " +
        "The old_string must appear exactly once in the file unless `replace_all` is true. " +
        "Include enough surrounding context to make old_string unique. " +
        "Use this instead of apply_patch for targeted edits.",
      inputSchema: {
        file_path: z
          .string()
          .describe(
            "The absolute path to the file to modify.",
          ),
        old_string: z
          .string()
          .describe(
            "The exact text to find and replace. Must match file content exactly, including indentation and whitespace.",
          ),
        new_string: z
          .string()
          .describe(
            "The text to replace old_string with (must be different from old_string).",
          ),
        replace_all: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Replace all occurrences of old_string. Default: false (requires exactly one match).",
          ),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Show what would be changed without writing. Default: false.",
          ),
      },
    },
    withToolError(
      async ({ file_path, old_string, new_string, replace_all, dry_run }) => {
        if (old_string === new_string) {
          return success("old_string and new_string are identical — nothing to do.", {
            applied: false,
            filePath: file_path,
            replacements: 0,
            error: "identical_strings",
          });
        }

        const workspacePath = await readWorkspacePath();
        const absPath = resolve(workspacePath, file_path);

        let content: string;
        try {
          content = await readFile(absPath, "utf-8");
        } catch (err: any) {
          if (err.code === "ENOENT") {
            return success(`File not found: ${file_path}`, {
              applied: false,
              filePath: file_path,
              replacements: 0,
              error: "file_not_found",
            });
          }
          throw err;
        }

        // Validate match
        if (!replace_all) {
          const match = validateUniqueMatch(content, old_string);
          if (!match.ok) {
            return success(match.error, {
              applied: false,
              filePath: file_path,
              replacements: 0,
              dryRun: Boolean(dry_run),
              matchesFound: match.count,
              error: match.count === 0 ? "not_found" : "not_unique",
            });
          }
        }

        const count = replace_all
          ? countOccurrences(content, old_string)
          : 1;

        if (count === 0) {
          return success("old_string not found in file.", {
            applied: false,
            filePath: file_path,
            replacements: 0,
            error: "not_found",
          });
        }

        const result: EditFileResult = {
          applied: false,
          dryRun: Boolean(dry_run),
          filePath: file_path,
          replacements: count,
        };

        if (dry_run) {
          const diff = buildDiffPreview(file_path, old_string, new_string, replace_all);
          return success(
            `### Dry Run — would replace ${count} occurrence(s)\n\n\`\`\`diff\n${diff}\n\`\`\``,
            result,
          );
        }

        // Apply
        const newContent = replace_all
          ? content.replaceAll(old_string, new_string)
          : content.replace(old_string, new_string);

        await writeFile(absPath, newContent, "utf-8");
        result.applied = true;

        return success(
          `### Edit Applied\n\n` +
            `File: \`${file_path}\`\n` +
            `Replacements: ${count}`,
          result,
        );
      },
    ),
  );
}
