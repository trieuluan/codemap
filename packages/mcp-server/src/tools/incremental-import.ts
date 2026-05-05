import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId, readWorkspacePath } from "../lib/workspace-project.js";
import type { FileReparseResult, ImportStatus } from "../lib/api-types.js";

const execFileAsync = promisify(execFile);

// ── Constants ─────────────────────────────────────────────────────────────────

const PARSEABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".dart", ".php", ".py",
]);

const REPARSE_CONCURRENCY = 5;

// ── Git helpers ───────────────────────────────────────────────────────────────

interface LocalFile {
  path: string;
  status: "added" | "modified" | "renamed" | "deleted" | "untracked";
  staged: boolean;
}

function parseNameStatus(raw: string, staged: boolean): LocalFile[] {
  const parts = raw.split("\0").filter(Boolean);
  const files: LocalFile[] = [];
  let i = 0;
  while (i < parts.length) {
    const code = parts[i];
    if (!code) { i++; continue; }
    if (code.startsWith("R") || code.startsWith("C")) {
      const newPath = parts[i + 2] ?? "";
      files.push({ path: newPath, status: "renamed", staged });
      i += 3;
    } else {
      const path = parts[i + 1] ?? "";
      const status: LocalFile["status"] =
        code[0] === "A" ? "added"
        : code[0] === "D" ? "deleted"
        : "modified";
      files.push({ path, status, staged });
      i += 2;
    }
  }
  return files.filter((f) => f.path);
}

async function getLocalChanges(cwd: string): Promise<LocalFile[]> {
  const [staged, unstaged, untracked] = await Promise.all([
    execFileAsync("git", ["diff", "--cached", "--name-status", "-z"], { cwd })
      .then(({ stdout }) => parseNameStatus(stdout, true))
      .catch(() => [] as LocalFile[]),
    execFileAsync("git", ["diff", "--name-status", "-z"], { cwd })
      .then(({ stdout }) => parseNameStatus(stdout, false))
      .catch(() => [] as LocalFile[]),
    execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd })
      .then(({ stdout }) =>
        stdout.split("\0").filter(Boolean).map((p): LocalFile => ({
          path: p, status: "untracked", staged: false,
        })),
      )
      .catch(() => [] as LocalFile[]),
  ]);

  // Deduplicate: staged wins over unstaged for same path
  const seen = new Map<string, LocalFile>();
  for (const f of [...staged, ...unstaged, ...untracked]) {
    if (!seen.has(f.path) || f.staged) seen.set(f.path, f);
  }
  return [...seen.values()];
}

// ── Reparse helpers ───────────────────────────────────────────────────────────

function isParseable(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  return dot !== -1 && PARSEABLE_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

interface ReparseOutcome {
  path: string;
  result: "reparsed" | "skipped" | "error";
  reason?: string;
}

async function reparseFile(
  client: ReturnType<typeof createCodeMapClient>,
  projectId: string,
  workspacePath: string,
  file: LocalFile,
): Promise<ReparseOutcome> {
  if (file.status === "deleted") {
    return { path: file.path, result: "skipped", reason: "deleted — will be cleaned up on next full reimport" };
  }
  if (!isParseable(file.path)) {
    return { path: file.path, result: "skipped", reason: "not a parseable file type" };
  }

  try {
    const absPath = `${workspacePath}/${file.path}`;
    const content = await readFile(absPath, "utf8");
    const contentHash = createHash("sha256").update(content).digest("hex");

    await client.request<FileReparseResult>(
      `/projects/${encodeURIComponent(projectId)}/map/files/reparse`,
      {
        authRequired: true,
        method: "POST",
        body: { path: file.path, content, contentHash },
      },
    );

    return { path: file.path, result: "reparsed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { path: file.path, result: "error", reason: msg };
  }
}

async function reparseBatch(
  client: ReturnType<typeof createCodeMapClient>,
  projectId: string,
  workspacePath: string,
  files: LocalFile[],
): Promise<ReparseOutcome[]> {
  const results: ReparseOutcome[] = [];
  for (let i = 0; i < files.length; i += REPARSE_CONCURRENCY) {
    const batch = files.slice(i, i + REPARSE_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((f) => reparseFile(client, projectId, workspacePath, f)),
    );
    results.push(...batchResults);
  }
  return results;
}

// ── Output ────────────────────────────────────────────────────────────────────

function buildOutput(
  outcomes: ReparseOutcome[],
  committedCount: number,
): string {
  const reparsed = outcomes.filter((o) => o.result === "reparsed");
  const skipped = outcomes.filter((o) => o.result === "skipped");
  const errors = outcomes.filter((o) => o.result === "error");

  const lines: string[] = ["## Incremental Import", ""];

  if (outcomes.length === 0) {
    lines.push("No changed files found — index is up to date.");
    return lines.join("\n");
  }

  lines.push(
    `Reparsed ${reparsed.length} file(s), skipped ${skipped.length}, errors ${errors.length}.`,
    committedCount > 0
      ? `Also found ${committedCount} committed file(s) since last import — use trigger_reimport for a full sync.`
      : "",
    "",
  );

  if (reparsed.length > 0) {
    lines.push(`### Reparsed (${reparsed.length})`);
    reparsed.forEach((o) => lines.push(`  ✓ ${o.path}`));
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push(`### Errors (${errors.length})`);
    errors.forEach((o) => lines.push(`  ✗ ${o.path}: ${o.reason}`));
    lines.push("");
  }

  if (skipped.length > 0) {
    lines.push(`### Skipped (${skipped.length})`);
    skipped.forEach((o) => lines.push(`  – ${o.path}: ${o.reason}`));
  }

  return lines.join("\n").trimEnd();
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerIncrementalImportTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "incremental_import",
    {
      title: "Incremental Import",
      description:
        "Reparse only locally changed files (staged + unstaged + untracked) without a full reimport. " +
        "Reads each changed file from disk, computes its hash, and sends it to the parse API. " +
        "Faster than trigger_reimport for small edits. " +
        "Does not handle deleted files or cross-file relationship recomputation — use trigger_reimport for those. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ project_id }) => {
      const client = createCodeMapClient(config);
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success(
          "No project linked. Run link_project or get_project first.",
          { projectId: null, status: "no_project" },
        );
      }

      const workspacePath = await readWorkspacePath();

      // ── Phase 1: local git changes ────────────────────────────────────────

      const localFiles = await getLocalChanges(workspacePath);

      // ── Phase 2: committed-but-not-imported files (informational) ─────────

      let committedCount = 0;
      try {
        const projectData = await client.request<{
          latestImport?: { commitSha?: string | null; status?: ImportStatus };
        }>(`/projects/${encodeURIComponent(resolvedProjectId)}`, { authRequired: true });

        const lastImportCommit = projectData.latestImport?.commitSha;
        if (lastImportCommit) {
          const { stdout } = await execFileAsync(
            "git",
            ["diff", "--name-only", lastImportCommit, "HEAD"],
            { cwd: workspacePath },
          ).catch(() => ({ stdout: "" }));
          const committedFiles = stdout.split("\n").filter(Boolean);
          // Count files in commits that are NOT already in local changes
          const localPaths = new Set(localFiles.map((f) => f.path));
          committedCount = committedFiles.filter((p) => !localPaths.has(p)).length;
        }
      } catch {
        // Non-fatal: proceed with local changes only
      }

      if (localFiles.length === 0) {
        return success(
          committedCount > 0
            ? `No uncommitted changes. ${committedCount} committed file(s) since last import — run trigger_reimport to sync.`
            : "No local changes and index is up to date.",
          {
            projectId: resolvedProjectId,
            status: "no_local_changes",
            committedCount,
            reparsed: [],
            skipped: [],
            errors: [],
            suggestedNextTools: committedCount > 0 ? ["trigger_reimport()"] : [],
          },
        );
      }

      // ── Phase 3: reparse changed files ───────────────────────────────────

      const outcomes = await reparseBatch(client, resolvedProjectId, workspacePath, localFiles);

      const reparsed = outcomes.filter((o) => o.result === "reparsed").map((o) => o.path);
      const skipped = outcomes.filter((o) => o.result === "skipped");
      const errors = outcomes.filter((o) => o.result === "error");

      const suggestedNextTools: string[] = [];
      if (errors.length > 0) {
        suggestedNextTools.push("trigger_reimport()  // some files failed — full reimport recommended");
      } else if (committedCount > 0) {
        suggestedNextTools.push("trigger_reimport()  // committed files not yet synced");
      } else {
        suggestedNextTools.push("get_working_diff()  // verify local changes");
      }

      return success(buildOutput(outcomes, committedCount), {
        projectId: resolvedProjectId,
        status: "completed",
        workspacePath,
        localFilesFound: localFiles.length,
        committedCount,
        reparsed,
        skipped: skipped.map((o) => ({ path: o.path, reason: o.reason })),
        errors: errors.map((o) => ({ path: o.path, reason: o.reason })),
        suggestedNextTools,
      });
    }),
  );
}
