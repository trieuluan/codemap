import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

const execFileAsync = promisify(execFile);

// ─── types ───────────────────────────────────────────────────────────────────

type WorkingDiffStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

interface WorkingDiffFile {
  path: string;
  status: WorkingDiffStatus;
  staged: boolean;
  oldPath?: string;
  patch?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<WorkingDiffStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

function parseStatusCode(code: string): WorkingDiffStatus {
  if (code.startsWith("R")) return "renamed";
  switch (code[0]) {
    case "A": return "added";
    case "D": return "deleted";
    case "?": return "untracked";
    default: return "modified";
  }
}

async function getStagedFiles(cwd: string): Promise<WorkingDiffFile[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--cached", "--name-status", "-z"],
      { cwd },
    );
    return parseNameStatus(stdout, true);
  } catch {
    return [];
  }
}

async function getUnstagedFiles(cwd: string): Promise<WorkingDiffFile[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-status", "-z"],
      { cwd },
    );
    return parseNameStatus(stdout, false);
  } catch {
    return [];
  }
}

async function getUntrackedFiles(cwd: string): Promise<WorkingDiffFile[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd },
    );
    return stdout
      .split("\0")
      .filter(Boolean)
      .map((p) => ({ path: p, status: "untracked" as const, staged: false }));
  } catch {
    return [];
  }
}

function parseNameStatus(raw: string, staged: boolean): WorkingDiffFile[] {
  const parts = raw.split("\0").filter(Boolean);
  const files: WorkingDiffFile[] = [];
  let i = 0;
  while (i < parts.length) {
    const code = parts[i];
    if (!code) { i++; continue; }

    if (code.startsWith("R") || code.startsWith("C")) {
      const oldPath = parts[i + 1] ?? "";
      const newPath = parts[i + 2] ?? "";
      files.push({ path: newPath, oldPath, status: parseStatusCode(code), staged });
      i += 3;
    } else {
      files.push({ path: parts[i + 1] ?? "", status: parseStatusCode(code), staged });
      i += 2;
    }
  }
  return files.filter((f) => f.path);
}

async function getPatch(cwd: string, filePath: string, staged: boolean): Promise<string> {
  try {
    const args = staged
      ? ["diff", "--cached", "--", filePath]
      : ["diff", "--", filePath];
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout;
  } catch {
    return "";
  }
}

function buildOutput(
  staged: WorkingDiffFile[],
  unstaged: WorkingDiffFile[],
  untracked: WorkingDiffFile[],
  includePatch: boolean,
): string {
  const lines: string[] = [];
  const allFiles = [...staged, ...unstaged, ...untracked];

  if (allFiles.length === 0) {
    return "No working tree changes — working directory is clean.";
  }

  lines.push(`Working tree changes: ${allFiles.length} file(s)`);

  if (staged.length > 0) {
    lines.push(`\nStaged (${staged.length}):`);
    for (const f of staged) {
      const icon = STATUS_ICON[f.status];
      const rename = f.oldPath ? ` (from ${f.oldPath})` : "";
      lines.push(`  ${icon} ${f.path}${rename}`);
    }
  }

  if (unstaged.length > 0) {
    lines.push(`\nUnstaged (${unstaged.length}):`);
    for (const f of unstaged) {
      const icon = STATUS_ICON[f.status];
      lines.push(`  ${icon} ${f.path}`);
    }
  }

  if (untracked.length > 0) {
    lines.push(`\nUntracked (${untracked.length}):`);
    for (const f of untracked) {
      lines.push(`  ? ${f.path}`);
    }
  }

  if (includePatch) {
    for (const f of [...staged, ...unstaged]) {
      if (f.patch) {
        lines.push(`\n--- ${f.staged ? "[staged] " : ""}${f.path} ---`);
        lines.push(f.patch);
      }
    }
  }

  return lines.join("\n");
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerGetWorkingDiffTool(server: McpServer) {
  server.registerTool(
    "get_working_diff",
    {
      title: "Get Working Tree Diff",
      description:
        "Show uncommitted changes in the local workspace — both staged and unstaged. " +
        "Use this to see what you (or another tool) just modified before committing or " +
        "before calling trigger_reimport. Unlike get_diff which compares two git refs, " +
        "this reads the live working tree so it reflects changes that haven't been committed yet. " +
        "Returns a grouped list of staged, unstaged, and untracked files with optional patch content.",
      inputSchema: {
        include_patch: z
          .boolean()
          .optional()
          .describe(
            "Include full unified diff patch for each changed file. " +
            "Omit or set false for a compact file list only. Default false.",
          ),
        include_untracked: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include untracked files in the result. Default true."),
      },
    },
    withToolError(async ({ include_patch, include_untracked }) => {
      const workspacePath = await readWorkspacePath();
      const includePatch = Boolean(include_patch);

      const [stagedFiles, unstagedFiles, untrackedFiles] = await Promise.all([
        getStagedFiles(workspacePath),
        getUnstagedFiles(workspacePath),
        include_untracked ? getUntrackedFiles(workspacePath) : Promise.resolve([]),
      ]);

      // Attach patch content if requested
      if (includePatch) {
        await Promise.all([
          ...stagedFiles.map(async (f) => {
            f.patch = await getPatch(workspacePath, f.path, true);
          }),
          ...unstagedFiles.map(async (f) => {
            f.patch = await getPatch(workspacePath, f.path, false);
          }),
        ]);
      }

      const allFiles = [...stagedFiles, ...unstagedFiles, ...untrackedFiles];
      const summary = buildOutput(stagedFiles, unstagedFiles, untrackedFiles, includePatch);

      return success(summary, {
        workspacePath,
        totalChanged: allFiles.length,
        staged: stagedFiles,
        unstaged: unstagedFiles,
        untracked: untrackedFiles,
        includePatch,
      });
    }),
  );
}
