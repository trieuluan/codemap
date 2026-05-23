import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath, readWorkspaceProjectId } from "../lib/workspace-project.js";

const execFileAsync = promisify(execFile);

// ─── types ───────────────────────────────────────────────────────────────────

interface ChangedFile {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  oldPath?: string;
}

/** Information for a single changed file enriched with CodeMap intelligence. */
interface FileIntelligenceReport {
  changedFile: ChangedFile;
  blastRadius?: {
    totalCount: number;
    directCount: number;
    maxDepth: number;
    hasCycles: boolean;
    affectedFiles: string[];
  };
  cyclesInvolving?: Array<{
    cycle: string[];
    edgeCount: number;
  }>;
  existsInIndex: boolean;
}

/** Overall intelligence summary across all changed files. */
interface PatchIntelligenceReport {
  filesWithRisk: number;
  filesWithCycles: number;
  totalAffectedFiles: number;
  totalCyclesInvolved: number;
  maxBlastRadiusDepth: number;
  highRiskFiles: Array<{
    path: string;
    affectedCount: number;
    cycleCount: number;
  }>;
  recommendations: string[];
}

interface SuggestPatchResult extends Record<string, unknown> {
  format: string;
  contextLines: number;
  totalFiles: number;
  changedFiles: ChangedFile[];
  intelligence?: PatchIntelligenceReport;
  fileReports: FileIntelligenceReport[];
  patch?: string;
  base64Patch?: string;
  workspaceClean: boolean;
  generatedAt: string;
}

// ─── helpers: git ────────────────────────────────────────────────────────────

async function getChangedFiles(cwd: string): Promise<ChangedFile[]> {
  const files: ChangedFile[] = [];

  // Staged changes
  try {
    const { stdout: stagedRaw } = await execFileAsync(
      "git",
      ["diff", "--cached", "--name-status", "-z"],
      { cwd },
    );
    files.push(...parseNameStatus(stagedRaw));
  } catch {
    /* no staged */
  }

  // Unstaged changes (avoid duplicates)
  const stagedPaths = new Set(files.map((f) => f.path));
  try {
    const { stdout: unstagedRaw } = await execFileAsync(
      "git",
      ["diff", "--name-status", "-z"],
      { cwd },
    );
    for (const f of parseNameStatus(unstagedRaw)) {
      if (!stagedPaths.has(f.path)) {
        files.push(f);
        stagedPaths.add(f.path);
      }
    }
  } catch {
    /* no unstaged */
  }

  // Untracked
  try {
    const { stdout: untrackedRaw } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd },
    );
    for (const p of untrackedRaw.split("\0").filter(Boolean)) {
      if (!stagedPaths.has(p)) {
        files.push({ path: p, status: "added" });
      }
    }
  } catch {
    /* no untracked */
  }

  return files;
}

function parseNameStatus(raw: string): ChangedFile[] {
  const parts = raw.split("\0").filter(Boolean);
  const files: ChangedFile[] = [];
  let i = 0;
  while (i < parts.length) {
    const code = parts[i];
    if (!code) { i++; continue; }
    if (code.startsWith("R") || code.startsWith("C")) {
      const oldPath = parts[i + 1] ?? "";
      const newPath = parts[i + 2] ?? "";
      files.push({ path: newPath, oldPath, status: "renamed" });
      i += 3;
    } else {
      const filePath = parts[i + 1] ?? "";
      if (filePath) {
        const statusMap: Record<string, ChangedFile["status"]> = {
          A: "added", D: "deleted", M: "modified",
        };
        files.push({ path: filePath, status: statusMap[code[0]] ?? "modified" });
      }
      i += 2;
    }
  }
  return files;
}

async function getUnifiedDiff(cwd: string, contextLines: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git", ["diff", "HEAD", `-U${contextLines}`],
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
        ["diff", "--no-index", "--unified=" + contextLines, "/dev/null", filePath],
        { cwd },
      );
      diffs.push(stdout.replace(/^diff --git \/dev\/null/gm, `diff --git a/${filePath}`));
    } catch {
      try {
        const { stdout: content } = await execFileAsync("cat", [filePath], { cwd });
        const lines = content.split("\n");
        diffs.push([
          `diff --git a/${filePath} b/${filePath}`,
          `new file mode 100644`,
          `--- /dev/null`,
          `+++ b/${filePath}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map((line) => `+${line}`),
        ].join("\n"));
      } catch {
        /* skip unreadable */
      }
    }
  }
  return diffs.join("\n");
}

// ─── helpers: CodeMap intelligence ───────────────────────────────────────────

async function fetchBlastRadius(
  client: ReturnType<typeof createCodeMapClient>,
  projectId: string,
  filePath: string,
): Promise<
  { totalCount: number; directCount: number; maxDepth: number; hasCycles: boolean; files: string[] } | null
> {
  try {
    const result = await client.request<{
      blastRadius?: {
        totalCount: number;
        directCount: number;
        maxDepth: number;
        hasCycles: boolean;
        files: Array<{ path: string; depth: number }>;
      };
    }>(
      `/projects/${encodeURIComponent(projectId)}/map/files/parse`,
      { authRequired: true, query: { path: filePath } },
    );
    if (!result.blastRadius) return null;
    return {
      totalCount: result.blastRadius.totalCount,
      directCount: result.blastRadius.directCount,
      maxDepth: result.blastRadius.maxDepth,
      hasCycles: result.blastRadius.hasCycles,
      files: result.blastRadius.files?.map((f) => f.path) ?? [],
    };
  } catch {
    return null;
  }
}

async function fetchProjectCycles(
  client: ReturnType<typeof createCodeMapClient>,
  projectId: string,
): Promise<Array<{ paths: string[]; edgeCount: number; kind: string; summary: string }>> {
  try {
    const insights = await client.request<{
      circularDependencyCandidates?: Array<{
        paths: string[];
        edgeCount: number;
        kind: string;
        summary: string;
      }>;
    }>(
      `/projects/${encodeURIComponent(projectId)}/map/insights`,
      { authRequired: true, query: { sections: "cycles" } },
    );
    return insights.circularDependencyCandidates ?? [];
  } catch {
    return [];
  }
}

/**
 * Check which changed files exist in the CodeMap parse index.
 */
async function checkFilesInIndex(
  client: ReturnType<typeof createCodeMapClient>,
  projectId: string,
  filePaths: string[],
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();

  await Promise.all(
    filePaths.map(async (fp) => {
      try {
        await client.request<Record<string, unknown>>(
          `/projects/${encodeURIComponent(projectId)}/map/files/parse`,
          { authRequired: true, query: { path: fp } },
        );
        results.set(fp, true);
      } catch {
        results.set(fp, false);
      }
    }),
  );

  return results;
}

async function buildIntelligenceReport(
  client: ReturnType<typeof createCodeMapClient>,
  projectId: string,
  changedFiles: ChangedFile[],
): Promise<{
  fileReports: FileIntelligenceReport[];
  summary: PatchIntelligenceReport;
}> {
  const fileReports: FileIntelligenceReport[] = [];
  const recommendations: string[] = [];
  const highRiskFiles: Array<{ path: string; affectedCount: number; cycleCount: number }> = [];

  // Check which files exist in the parse index
  const trackedPaths = changedFiles
    .filter((f) => f.status !== "added")
    .map((f) => f.path);
  const indexMap = await checkFilesInIndex(client, projectId, trackedPaths);

  // Fetch all existing cycles
  const allCycles = await fetchProjectCycles(client, projectId);

  // Fetch blast radius for each tracked changed file
  for (const file of changedFiles) {
    const report: FileIntelligenceReport = {
      changedFile: file,
      existsInIndex: indexMap.get(file.path) ?? false,
    };

    // Only analyze blast radius for files that exist in the index
    // (deleted files: check blast radius of the old path before deletion)
    const pathToCheck =
      file.status === "renamed" && file.oldPath
        ? file.oldPath
        : file.path;

    if (file.status !== "added" || file.oldPath) {
      const blast = await fetchBlastRadius(client, projectId, pathToCheck);
      if (blast) {
        report.blastRadius = {
          totalCount: blast.totalCount,
          directCount: blast.directCount,
          maxDepth: blast.maxDepth,
          hasCycles: blast.hasCycles,
          affectedFiles: blast.files,
        };
      }
    }

    // Check if this file is involved in any cycle
    const cyclesInvolving = allCycles.filter((c) =>
      c.paths.includes(file.path) || (file.oldPath && c.paths.includes(file.oldPath)),
    );
    if (cyclesInvolving.length > 0) {
      report.cyclesInvolving = cyclesInvolving.map((c) => ({
        cycle: c.paths,
        edgeCount: c.edgeCount,
      }));
    }

    fileReports.push(report);
  }

  // ── Build summary
  let totalAffected = 0;
  let filesWithCycles = 0;
  let totalCyclesInvolved = 0;
  let maxDepth = 0;
  let filesWithRisk = 0;

  for (const r of fileReports) {
    if (r.blastRadius) {
      totalAffected += r.blastRadius.affectedFiles.length;
      maxDepth = Math.max(maxDepth, r.blastRadius.maxDepth);

      // Risk thresholds: >10 affected, depth >3, or cycles
      const isHighRisk =
        r.blastRadius.directCount > 10 ||
        r.blastRadius.maxDepth > 3 ||
        r.blastRadius.hasCycles ||
        (r.cyclesInvolving && r.cyclesInvolving.length > 0);

      if (isHighRisk) filesWithRisk++;

      if (r.cyclesInvolving && r.cyclesInvolving.length > 0) {
        filesWithCycles++;
        totalCyclesInvolved += r.cyclesInvolving.length;
        highRiskFiles.push({
          path: r.changedFile.path,
          affectedCount: r.blastRadius.affectedFiles.length,
          cycleCount: r.cyclesInvolving.length,
        });
      } else if (r.blastRadius && r.blastRadius.totalCount > 10) {
        highRiskFiles.push({
          path: r.changedFile.path,
          affectedCount: r.blastRadius.totalCount,
          cycleCount: 0,
        });
      }
    }

    // Warn if changed file is not in parse index (new file or unsupported language)
    if (r.changedFile.status === "added" && !r.existsInIndex) {
      recommendations.push(
        `\`${r.changedFile.path}\` không có trong parse index — có thể là file mới hoặc language chưa được hỗ trợ. AI sẽ không thể phân tích blast radius cho file này.`,
      );
    }

    // High blast radius warning
    if (r.blastRadius && r.blastRadius.totalCount > 50) {
      recommendations.push(
        `\`${r.changedFile.path}\` có blast radius lớn (${r.blastRadius.totalCount} files bị ảnh hưởng). Cân nhắc review kỹ trước khi merge.`,
      );
    }

    // File in cycle warning
    if (r.cyclesInvolving && r.cyclesInvolving.length > 0) {
      for (const cycle of r.cyclesInvolving) {
        recommendations.push(
          `\`${r.changedFile.path}\` đang nằm trong circular dependency: ${cycle.cycle.join(" → ")}`,
        );
      }
    }
  }

  // General recommendation if there are deep dependency chains
  if (maxDepth > 5) {
    recommendations.push(
      `Một số thay đổi có mức độ ảnh hưởng sâu (depth ${maxDepth}). Đảm bảo test kỹ các layers sâu.`,
    );
  }

  const summary: PatchIntelligenceReport = {
    filesWithRisk,
    filesWithCycles,
    totalAffectedFiles: totalAffected,
    totalCyclesInvolved: totalCyclesInvolved,
    maxBlastRadiusDepth: maxDepth,
    highRiskFiles,
    recommendations,
  };

  return { fileReports, summary };
}

// ─── helpers: build output text ──────────────────────────────────────────────

const STATUS_ICON: Record<string, string> = {
  modified: "~",
  added: "+",
  deleted: "-",
  renamed: "→",
};

function buildSummary(
  files: ChangedFile[],
  diffLength: number,
  intelligence?: PatchIntelligenceReport,
): string {
  const lines: string[] = [];

  if (files.length === 0) {
    return "✨ No changes detected — working directory is clean.";
  }

  // ── Changes overview
  lines.push(`📝 Patch generated: ${files.length} file(s) changed`);
  lines.push("");

  for (const f of files) {
    const icon = STATUS_ICON[f.status] ?? "?";
    const rename = f.oldPath ? ` (renamed from ${f.oldPath})` : "";
    lines.push(`  ${icon} ${f.path}${rename}`);
  }

  lines.push("");
  lines.push(`📦 Diff size: ${(diffLength / 1024).toFixed(1)} KB`);

  // ── Intelligence section
  if (intelligence) {
    lines.push("");
    lines.push("──".repeat(30));
    lines.push("🧠 Blast Radius & Cycle Analysis");
    lines.push("──".repeat(30));
    lines.push("");

    if (intelligence.filesWithRisk === 0 && intelligence.totalAffectedFiles === 0) {
      lines.push("✅ **Không phát hiện rủi ro lớn.** Không có file nào thay đổi có blast radius hoặc cycle đáng kể.");
    } else {
      // Risk overview
      lines.push(`⚠️ **Risk Summary:**`);
      lines.push(`  - High-risk files: ${intelligence.filesWithRisk}`);
      lines.push(`  - Files in cycles: ${intelligence.filesWithCycles}`);
      lines.push(`  - Total affected files (downstream): ${intelligence.totalAffectedFiles}`);
      lines.push(`  - Max blast radius depth: ${intelligence.maxBlastRadiusDepth}`);
      lines.push(`  - Total cycles involved: ${intelligence.totalCyclesInvolved}`);

      // High-risk files
      if (intelligence.highRiskFiles.length > 0) {
        lines.push("");
        lines.push("🔴 **High-Risk Files:**");
        for (const hf of intelligence.highRiskFiles.slice(0, 10)) {
          const parts: string[] = [`\`${hf.path}\``];
          if (hf.affectedCount > 0) parts.push(`${hf.affectedCount} affected`);
          if (hf.cycleCount > 0) parts.push(`${hf.cycleCount} cycles`);
          lines.push(`  - ${parts.join(" | ")}`);
        }
        if (intelligence.highRiskFiles.length > 10) {
          lines.push(`  ... and ${intelligence.highRiskFiles.length - 10} more`);
        }
      }

      // Recommendations
      if (intelligence.recommendations.length > 0) {
        lines.push("");
        lines.push("💡 **Recommendations:**");
        for (const rec of intelligence.recommendations.slice(0, 10)) {
          lines.push(`  - ${rec}`);
        }
      }
    }
  }

  return lines.join("\n");
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerSuggestPatchTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "suggest_patch",
    {
      title: "Suggest Patch",
      description:
        "Analyze changes and suggest a patch/base64-encoded diff for review or application. " +
        "Compares the current workspace state against the last committed state " +
        "to generate a patch that can be applied elsewhere. " +
        "Automatically includes blast radius analysis (which downstream files are affected), " +
        "cycle detection (whether changed files are involved in circular dependencies), " +
        "and AI-ready recommendations. " +
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
          .describe("Number of context lines to include around changes. Default: 3."),
        with_intelligence: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Include blast radius and cycle analysis for changed files. " +
              "Requires a linked CodeMap project with parse index. Default: true.",
          ),
        project_id: z
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ format, context_lines, with_intelligence, project_id }) => {
      const workspacePath = await readWorkspacePath();
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());
      const contextLines = context_lines ?? 3;
      const outputFormat = format ?? "unified";
      const includeIntelligence = with_intelligence !== false;

      // Get changed files
      const changedFiles = await getChangedFiles(workspacePath);

      // Generate unified diff
      const trackedDiff = await getUnifiedDiff(workspacePath, contextLines);

      // Untracked files diff
      const untrackedFiles = changedFiles.filter(
        (f) => f.status === "added" && !f.oldPath,
      );
      const untrackedDiff = await getUntrackedDiff(
        workspacePath,
        contextLines,
        untrackedFiles.map((f) => f.path),
      );

      // Combine
      let fullDiff = trackedDiff;
      if (untrackedDiff) {
        fullDiff = fullDiff ? `${fullDiff}\n\n${untrackedDiff}` : untrackedDiff;
      }

      // Intelligence analysis
      let intelligenceResult:
        | { fileReports: FileIntelligenceReport[]; summary: PatchIntelligenceReport }
        | undefined;

      if (includeIntelligence && resolvedProjectId && changedFiles.length > 0) {
        try {
          intelligenceResult = await buildIntelligenceReport(
            client,
            resolvedProjectId,
            changedFiles,
          );
        } catch {
          // Intelligence failed — still return the diff
          intelligenceResult = undefined;
        }
      }

      // Build response
      const result: SuggestPatchResult = {
        format: outputFormat,
        contextLines,
        totalFiles: changedFiles.length,
        changedFiles,
        fileReports: intelligenceResult?.fileReports ?? [],
        intelligence: intelligenceResult?.summary,
        workspaceClean: changedFiles.length === 0,
        generatedAt: new Date().toISOString(),
        hasIntelligence: !!intelligenceResult,
        projectId: resolvedProjectId,
      };

      if (outputFormat === "unified" || outputFormat === "both") {
        result.patch = fullDiff;
      }

      if (outputFormat === "base64" || outputFormat === "both") {
        result.base64Patch = fullDiff
          ? Buffer.from(fullDiff, "utf-8").toString("base64")
          : undefined;
      }

      const summary = buildSummary(
        changedFiles,
        fullDiff?.length ?? 0,
        intelligenceResult?.summary,
      );

      return success(summary, result);
    }),
  );
}
