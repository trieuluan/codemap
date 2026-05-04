import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

const execFileAsync = promisify(execFile);

// ─── types ───────────────────────────────────────────────────────────────────

interface PatchFileInfo {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  oldPath?: string;
  diff?: string;
}

interface SuggestPatchResult {
  format: string;
  contextLines: number;
  totalFiles: number;
  files: PatchFileInfo[];
  patch?: string;
  base64Patch?: string;
  workspaceClean: boolean;
  generatedAt: string;
  [key: string]: unknown;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getChangedFiles(cwd: string): Promise<PatchFileInfo[]> {
  const files: PatchFileInfo[] = [];

  // Get staged files
  try {
    const { stdout: stagedRaw } = await execFileAsync(
      "git",
      ["diff", "--cached", "--name-status", "-z"],
      { cwd },
    );
    const stagedParts = stagedRaw.split("\0").filter(Boolean);
    let i = 0;
    while (i < stagedParts.length) {
      const code = stagedParts[i];
      if (code.startsWith("R") || code.startsWith("C")) {
        const oldPath = stagedParts[i + 1] ?? "";
        const newPath = stagedParts[i + 2] ?? "";
        files.push({
          path: newPath,
          oldPath,
          status: "renamed",
        });
        i += 3;
      } else {
        const path = stagedParts[i + 1] ?? "";
        if (path) {
          const statusMap: Record<string, PatchFileInfo["status"]> = {
            A: "added",
            D: "deleted",
            M: "modified",
          };
          files.push({ path, status: statusMap[code[0]] ?? "modified" });
        }
        i += 2;
      }
    }
  } catch {
    // No staged files
  }

  // Get unstaged files (not already in staged list)
  const stagedPaths = new Set(files.map((f) => f.path));
  try {
    const { stdout: unstagedRaw } = await execFileAsync(
      "git",
      ["diff", "--name-status", "-z"],
      { cwd },
    );
    const unstagedParts = unstagedRaw.split("\0").filter(Boolean);
    let i = 0;
    while (i < unstagedParts.length) {
      const code = unstagedParts[i];
      if (code.startsWith("R") || code.startsWith("C")) {
        const oldPath = unstagedParts[i + 1] ?? "";
        const newPath = unstagedParts[i + 2] ?? "";
        if (!stagedPaths.has(newPath)) {
          files.push({ path: newPath, oldPath, status: "renamed" });
        }
        i += 3;
      } else {
        const filePath = unstagedParts[i + 1] ?? "";
        if (filePath && !stagedPaths.has(filePath)) {
          const statusMap: Record<string, PatchFileInfo["status"]> = {
            A: "added",
            D: "deleted",
            M: "modified",
          };
          files.push({ path: filePath, status: statusMap[code[0]] ?? "modified" });
        }
        i += 2;
      }
    }
  } catch {
    // No unstaged files
  }

  // Get untracked files
  try {
    const { stdout: untrackedRaw } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd },
    );
    const untrackedPaths = untrackedRaw.split("\0").filter(Boolean);
    const existingPaths = new Set(files.map((f) => f.path));
    for (const p of untrackedPaths) {
      if (p && !existingPaths.has(p)) {
        files.push({ path: p, status: "added" });
      }
    }
  } catch {
    // No untracked files
  }

  return files;
}

async function getUnifiedDiff(
  cwd: string,
  contextLines: number,
): Promise<string> {
  try {
    // Get full working tree diff (staged + unstaged combined against HEAD)
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "HEAD", `-U${contextLines}`],
      { cwd },
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

async function getUntrackedDiff(
  cwd: string,
  contextLines: number,
  untrackedFiles: string[],
): Promise<string> {
  const diffs: string[] = [];

  for (const filePath of untrackedFiles) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["diff", "--no-index", `/dev/null`, filePath, `-U${contextLines}`],
        { cwd },
      );
      // Convert /dev/null path to a/ and b/ format for consistency
      const adjusted = stdout
        .replace(/\/dev\/null/g, filePath)
        .replace(new RegExp(`a/${filePath}`), `a/${filePath}`)
        .replace(new RegExp(`b/${filePath}`), `b/${filePath}`);
      diffs.push(adjusted);
    } catch {
      // If git diff --no-index fails, read the file content directly
      try {
        const { stdout: content } = await execFileAsync("cat", [filePath], {
          cwd,
        });
        const lines = content.split("\n");
        const diffLines = [
          `diff --git a/${filePath} b/${filePath}`,
          `new file mode 100644`,
          `--- /dev/null`,
          `+++ b/${filePath}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map((line) => `+${line}`),
        ];
        diffs.push(diffLines.join("\n"));
      } catch {
        // Skip files we can't read
      }
    }
  }

  return diffs.join("\n");
}

function buildSummary(files: PatchFileInfo[], diffLength: number): string {
  const lines: string[] = [];

  if (files.length === 0) {
    lines.push("No changes detected — working directory is clean.");
    return lines.join("\n");
  }

  lines.push(`Patch generated from ${files.length} changed file(s):\n`);

  const byStatus = files.reduce(
    (acc, f) => {
      acc[f.status] = (acc[f.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  if (byStatus.modified) lines.push(`  Modified: ${byStatus.modified} file(s)`);
  if (byStatus.added) lines.push(`  Added: ${byStatus.added} file(s)`);
  if (byStatus.deleted) lines.push(`  Deleted: ${byStatus.deleted} file(s)`);
  if (byStatus.renamed) lines.push(`  Renamed: ${byStatus.renamed} file(s)`);

  lines.push(`\nTotal diff size: ${diffLength} bytes`);

  return lines.join("\n");
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerSuggestPatchTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "suggest_patch",
    {
      title: "Suggest Patch",
      description:
        "Analyze changes and suggest a patch/base64-encoded diff for review or application. " +
        "Compares the current workspace state against the last committed state " +
        "to generate a patch that can be applied elsewhere. " +
        "Supports both unified diff format and base64 encoding.",
      inputSchema: {
        format: z
          .enum(["unified", "base64", "both"])
          .optional()
          .default("unified")
          .describe(
            "Output format for the patch. " +
              "'unified' produces human-readable diff, 'base64' produces encoded patch, " +
              "'both' returns both formats.",
          ),
        context_lines: z
          .number()
          .optional()
          .default(3)
          .describe(
            "Number of context lines to include around changes. Default: 3.",
          ),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
      },
    },
    withToolError(async ({ format, context_lines, project_id }) => {
      const workspacePath = await readWorkspacePath();
      const contextLines = context_lines ?? 3;
      const outputFormat = format ?? "unified";

      // Get list of changed files
      const changedFiles = await getChangedFiles(workspacePath);

      // Get unified diff for tracked files
      const trackedDiff = await getUnifiedDiff(workspacePath, contextLines);

      // Get diff for untracked files
      const untrackedFiles = changedFiles.filter(
        (f) => f.status === "added" && !f.oldPath,
      );
      const untrackedDiff = await getUntrackedDiff(
        workspacePath,
        contextLines,
        untrackedFiles.map((f) => f.path),
      );

      // Combine diffs
      let fullDiff = trackedDiff;
      if (untrackedDiff) {
        fullDiff = fullDiff ? `${fullDiff}\n\n${untrackedDiff}` : untrackedDiff;
      }

      // Build response based on format
      const result: SuggestPatchResult = {
        format: outputFormat,
        contextLines,
        totalFiles: changedFiles.length,
        files: changedFiles,
        workspaceClean: changedFiles.length === 0,
        generatedAt: new Date().toISOString(),
      };

      if (outputFormat === "unified" || outputFormat === "both") {
        result.patch = fullDiff;
      }

      if (outputFormat === "base64" || outputFormat === "both") {
        result.base64Patch = fullDiff
          ? Buffer.from(fullDiff, "utf-8").toString("base64")
          : undefined;
      }

      const summary = buildSummary(changedFiles, fullDiff?.length ?? 0);

      return success(summary, result);
    }),
  );
}
