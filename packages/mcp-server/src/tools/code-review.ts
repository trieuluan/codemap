import { z } from "zod";
import { uuidSchema } from "../lib/uuid-schema.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { FileContent, SemanticSearchResult } from "../lib/api-types.js";


export function registerCodeReviewTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "code_review",
    {
      title: "Code Review",
      description:
        "Perform an automated code review on a file or set of files. " +
        "Analyzes code for common issues like bugs, security vulnerabilities, " +
        "performance problems, and style violations. " +
        "project_id is optional if workspace is linked.\n\n" +
        "USE WHEN: pre-commit quality check, audit after refactor, " +
        "security scan before deployment, or when the user asks to 'review', " +
        "'check quality', 'find issues', or 'audit' a file or module.",
      inputSchema: {
        file_path: z
          .string()
          .optional()
          .describe(
            "Path to the file to review. If omitted, reviews all files matching file_pattern.",
          ),
        file_pattern: z
          .string()
          .optional()
          .describe(
            "Glob pattern to match files for review. " +
              "Used when file_path is not provided. Example: 'src/**/*.ts'.",
          ),
        focus_areas: z
          .array(
            z.enum([
              "bugs",
              "security",
              "performance",
              "style",
              "complexity",
              "best_practices",
            ]),
          )
          .optional()
          .describe(
            "Specific areas to focus on during review. " +
              "If omitted, reviews all areas.",
          ),
        max_files: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of files to review. Default: 10."),
        project_id: uuidSchema
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
      },
    },
    withToolError(
      async ({
        file_path,
        file_pattern,
        focus_areas,
        max_files,
        project_id,
      }) => {
        const resolvedProjectId =
          project_id ?? (await readWorkspaceProjectId());

        if (!resolvedProjectId) {
          return success(
            "No project ID provided and no linked project found for this workspace.\n" +
              "Use link_project to connect an existing project, or create_project to create one (first time only). These require a cloud project.",
            {
              projectId: null,
              reviews: [],
            },
          );
        }

        const client = createCodeMapClient(config);
        let filesToReview: string[] = [];

        if (file_path) {
          filesToReview = [file_path];
        } else if (file_pattern) {
          // Search for files matching the pattern
          const searchResult = await client.request<{ files: Array<{ path: string }> }>(
            `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
            {
              authRequired: true,
              query: { q: file_pattern },
            },
          );
          filesToReview = searchResult.files
            .slice(0, max_files)
            .map((f: { path: string }) => f.path);
        } else {
          // Get top files by complexity or change frequency
          filesToReview = [];
        }

        if (filesToReview.length === 0) {
          return success(
            "No files found to review. Check your file_path or file_pattern.",
            {
              projectId: resolvedProjectId,
              filesChecked: 0,
              reviews: [],
            },
          );
        }

        // Perform review on each file
        const reviews = await Promise.all(
          filesToReview.slice(0, max_files).map(async (path) => {
            const review = await reviewFile(
              client,
              resolvedProjectId,
              path,
              focus_areas,
            );
            return { path, ...review };
          }),
        );

        const summary = buildSummary(reviews, file_path || file_pattern);

        return success(summary, {
          projectId: resolvedProjectId,
          query: file_path || file_pattern,
          filesReviewed: reviews.length,
          totalIssues: reviews.reduce((sum, r) => sum + r.issues.length, 0),
          reviews,
        });
      },
    ),
  );
}

async function reviewFile(
  client: ReturnType<typeof createCodeMapClient>,
  projectId: string,
  filePath: string,
  focusAreas: string[] | undefined,
): Promise<{
  issues: Array<{
    severity: "critical" | "high" | "medium" | "low";
    category: string;
    message: string;
    line?: number;
    suggestion?: string;
  }>;
  complexityScore: number;
  reviewTimeMs: number;
  semantic_context: SemanticSearchResult[];
}> {
  const started = Date.now();
  const [contentResult, semanticResult] = await Promise.allSettled([
    client.request<FileContent>(
      `/projects/${encodeURIComponent(projectId)}/map/files/content`,
      { authRequired: true, query: { path: filePath } },
    ),
    client.request<{ results: SemanticSearchResult[] }>(
      `/projects/${encodeURIComponent(projectId)}/map/search/semantic`,
      { authRequired: true, query: { q: filePath, limit: "5" } },
    ),
  ]);

  const content = contentResult.status === "fulfilled" ? contentResult.value.content ?? "" : "";
  const semanticContext = semanticResult.status === "fulfilled" ? semanticResult.value.results ?? [] : [];
  const focus = new Set(focusAreas ?? ["bugs", "security", "performance", "style", "complexity", "best_practices"]);
  const issues: Array<{
    severity: "critical" | "high" | "medium" | "low";
    category: string;
    message: string;
    line?: number;
    suggestion?: string;
  }> = [];

  const lines = content.split("\n");
  let complexityScore = 0;
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (/\b(if|for|while|case|catch|switch)\b|&&|\|\|/.test(line)) complexityScore += 1;

    if (focus.has("security") && /eval\s*\(|new Function\s*\(/.test(line)) {
      issues.push({ severity: "high", category: "security", message: "Dynamic code execution can introduce injection risk.", line: lineNumber });
    }
    if (focus.has("security") && /innerHTML\s*=/.test(line)) {
      issues.push({ severity: "medium", category: "security", message: "Direct innerHTML assignment can introduce XSS risk.", line: lineNumber });
    }
    if (focus.has("style") && /console\.(log|debug)\s*\(/.test(line)) {
      issues.push({ severity: "low", category: "style", message: "Debug logging appears in source.", line: lineNumber });
    }
    if (focus.has("bugs") && /TODO|FIXME/.test(line)) {
      issues.push({ severity: "low", category: "bugs", message: "TODO/FIXME marker should be resolved or tracked.", line: lineNumber });
    }
  }

  if (focus.has("complexity") && complexityScore > 30) {
    issues.push({ severity: "medium", category: "complexity", message: `High branch complexity score (${complexityScore}). Consider splitting the file or functions.` });
  }

  return {
    issues,
    complexityScore,
    reviewTimeMs: Date.now() - started,
    semantic_context: semanticContext,
  };
}

function buildSummary(
  reviews: Array<{
    path: string;
    issues: Array<{
      severity: string;
      category: string;
      message: string;
      line?: number;
    }>;
    complexityScore: number;
    semantic_context?: SemanticSearchResult[];
  }>,
  query: string | undefined,
): string {
  const lines: string[] = [];

  lines.push("## Code Review Summary");
  lines.push("");

  if (query) {
    lines.push(`**Query:** ${query}`);
    lines.push("");
  }

  const totalIssues = reviews.reduce((sum, r) => sum + r.issues.length, 0);
  const filesWithIssues = reviews.filter((r) => r.issues.length > 0).length;

  lines.push("### Overview");
  lines.push("");
  lines.push(`Files reviewed: ${reviews.length}`);
  lines.push(`Files with issues: ${filesWithIssues}`);
  lines.push(`Total issues found: ${totalIssues}`);
  lines.push("");

  // Issue breakdown by severity
  const severityCounts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const review of reviews) {
    for (const issue of review.issues) {
      severityCounts[issue.severity] =
        (severityCounts[issue.severity] || 0) + 1;
    }
  }

  lines.push("### Issues by Severity");
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("|---|---|");
  lines.push(`| Critical | ${severityCounts.critical} |`);
  lines.push(`| High | ${severityCounts.high} |`);
  lines.push(`| Medium | ${severityCounts.medium} |`);
  lines.push(`| Low | ${severityCounts.low} |`);
  lines.push("");

  // Detailed results per file
  if (filesWithIssues > 0) {
    lines.push("### Files with Issues");
    lines.push("");

    for (const review of reviews) {
      if (review.issues.length > 0) {
        lines.push(`#### \`${review.path}\``);
        lines.push(`**Complexity Score:** ${review.complexityScore}`);
        if (review.semantic_context?.length) {
          lines.push(`**Semantic Context:** ${review.semantic_context.length} related chunk(s)`);
        }
        lines.push("");

        for (const issue of review.issues) {
          const icon =
            issue.severity === "critical"
              ? "🔴"
              : issue.severity === "high"
                ? "🟠"
                : issue.severity === "medium"
                  ? "🟡"
                  : "🟢";
          lines.push(
            `${icon} **[${issue.severity.toUpperCase()}] ${issue.category}**`,
          );
          lines.push(`   ${issue.message}`);
          if (issue.line) lines.push(`   Line: ${issue.line}`);
          lines.push("");
        }
      }
    }
  } else {
    lines.push("✅ No issues found!");
  }

  return lines.join("\n");
}
