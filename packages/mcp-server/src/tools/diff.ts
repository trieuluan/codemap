import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { uuidSchema } from "../lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath, readWorkspaceProjectId } from "../lib/workspace-project.js";

const execFileAsync = promisify(execFile);

// ─── working-tree types ──────────────────────────────────────────────────────

type WorkingDiffStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

interface WorkingDiffFile {
  path: string;
  status: WorkingDiffStatus;
  staged: boolean;
  oldPath?: string;
  patch?: string;
}

// ─── ref-diff types ──────────────────────────────────────────────────────────

type DiffFileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

interface DiffFile {
  path: string;
  status: DiffFileStatus;
  oldPath?: string;
  patch?: string;
}

interface ProjectDiffResponse {
  from: string;
  to: string;
  files: DiffFile[];
}

const STATUS_ICON_WORKING: Record<WorkingDiffStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

const STATUS_ICON_REF: Record<DiffFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
};

// ─── working-tree helpers ────────────────────────────────────────────────────

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

async function getWorkingPatch(cwd: string, filePath: string, staged: boolean): Promise<string> {
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

function buildWorkingOutput(
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
      const icon = STATUS_ICON_WORKING[f.status];
      const rename = f.oldPath ? ` (from ${f.oldPath})` : "";
      lines.push(`  ${icon} ${f.path}${rename}`);
    }
  }

  if (unstaged.length > 0) {
    lines.push(`\nUnstaged (${unstaged.length}):`);
    for (const f of unstaged) {
      const icon = STATUS_ICON_WORKING[f.status];
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

// ─── ref-diff helpers ────────────────────────────────────────────────────────

function buildRefOutput(result: ProjectDiffResponse, includePatch: boolean): string {
  const lines: string[] = [
    `Diff: ${result.from.slice(0, 8)}..${result.to.slice(0, 8)}`,
    `Files changed: ${result.files.length}\n`,
  ];

  for (const file of result.files) {
    const icon = STATUS_ICON_REF[file.status] ?? "M";
    const rename = file.oldPath ? ` (from ${file.oldPath})` : "";
    lines.push(`${icon} ${file.path}${rename}`);
  }

  if (includePatch) {
    for (const file of result.files) {
      if (file.patch) {
        lines.push(`\n--- ${file.path} ---`);
        lines.push(file.patch);
      }
    }
  }

  return lines.join("\n");
}

// ─── unified tool ────────────────────────────────────────────────────────────

export function registerDiffTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "diff",
    {
      title: "Diff",
      description:
        "Show git diff. Two modes:\n" +
        "  • mode=\"working\" (default): uncommitted local changes — staged, unstaged, and untracked files. " +
        "Use after edits to verify what changed before committing or calling reimport.\n" +
        "  • mode=\"ref\": diff between two committed refs (commits, branches, tags) in the linked CodeMap project. " +
        "Requires `from` (and optional `to`). Useful for reviewing PRs or debugging regressions. " +
        "Requires a retained workspace on the project.\n" +
        "project_id is optional in ref mode if the workspace is linked.",
      inputSchema: {
        mode: z
          .enum(["working", "ref"])
          .optional()
          .describe(
            "Which diff to compute. \"working\" = uncommitted local changes (default). " +
            "\"ref\" = diff between two committed git refs via the linked project.",
          ),
        from: z
          .string()
          .min(1)
          .optional()
          .describe("Ref mode only: base commit SHA or ref (e.g. branch name, tag, HEAD~1)."),
        to: z
          .string()
          .min(1)
          .optional()
          .describe("Ref mode only: target commit SHA or ref. Defaults to HEAD."),
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
          .describe("Working mode only: include untracked files in the result. Default true."),
        project_id: uuidSchema
          .optional()
          .describe("Ref mode only: CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ mode, from, to, include_patch, include_untracked, project_id }) => {
      const resolvedMode = mode ?? "working";
      const includePatch = Boolean(include_patch);

      if (resolvedMode === "working") {
        const workspacePath = await readWorkspacePath();

        const [stagedFiles, unstagedFiles, untrackedFiles] = await Promise.all([
          getStagedFiles(workspacePath),
          getUnstagedFiles(workspacePath),
          include_untracked ? getUntrackedFiles(workspacePath) : Promise.resolve([]),
        ]);

        if (includePatch) {
          await Promise.all([
            ...stagedFiles.map(async (f) => {
              f.patch = await getWorkingPatch(workspacePath, f.path, true);
            }),
            ...unstagedFiles.map(async (f) => {
              f.patch = await getWorkingPatch(workspacePath, f.path, false);
            }),
          ]);
        }

        const allFiles = [...stagedFiles, ...unstagedFiles, ...untrackedFiles];
        const summary = buildWorkingOutput(stagedFiles, unstagedFiles, untrackedFiles, includePatch);

        return success(summary, {
          mode: "working" as const,
          workspacePath,
          totalChanged: allFiles.length,
          staged: stagedFiles,
          unstaged: unstagedFiles,
          untracked: untrackedFiles,
          includePatch,
        });
      }

      // mode === "ref"
      if (!from) {
        return success(
          "ref mode requires a `from` ref. Example: { mode: \"ref\", from: \"main\" }.",
          {
            mode: "ref" as const,
            available: false,
            from: null,
            to: to ?? "HEAD",
            includePatch,
            totalChanged: 0,
            files: [],
          },
        );
      }

      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        const summary =
          "No project ID provided and no linked project found for this workspace.\n" +
          "Use link_project to connect an existing project, or create_project to create one (first time only). These require a cloud project.";

        return success(summary, {
          mode: "ref" as const,
          projectId: null,
          available: false,
          from,
          to: to ?? "HEAD",
          includePatch,
          totalChanged: 0,
          files: [],
        });
      }

      const query: Record<string, string> = { from };
      if (to) query.to = to;
      if (includePatch) query.includePatch = "true";

      let result: ProjectDiffResponse;

      try {
        result = await client.request<ProjectDiffResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/diff`,
          { authRequired: true, query },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("404")) {
          return success(`Project not found: ${resolvedProjectId}`, {
            mode: "ref" as const,
            projectId: resolvedProjectId,
            available: false,
            from,
            to: to ?? "HEAD",
            includePatch,
            totalChanged: 0,
            files: [],
          });
        }
        if (message.includes("422")) {
          const summary =
            "Retained workspace is not available for this project. " +
            "Re-import the project to restore git access.";

          return success(summary, {
            mode: "ref" as const,
            projectId: resolvedProjectId,
            available: false,
            from,
            to: to ?? "HEAD",
            includePatch,
            totalChanged: 0,
            files: [],
          });
        }

        throw error;
      }

      return success(buildRefOutput(result, includePatch), {
        mode: "ref" as const,
        projectId: resolvedProjectId,
        available: true,
        from: result.from,
        to: result.to,
        includePatch,
        totalChanged: result.files.length,
        files: result.files,
      });
    }),
  );
}
