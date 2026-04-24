import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import type { ProjectDetail, ProjectImportDetail } from "../lib/api-types.js";

const RESOURCE_URI = "codemap://project/context";

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatProvider(provider: string | null): string {
  if (provider === "github") return "GitHub";
  if (provider === "local_workspace") return "Local workspace";
  return "Unknown";
}

function buildContextText(
  project: ProjectDetail,
  latestImport: ProjectImportDetail | null,
): string {
  const lines: string[] = [
    "# CodeMap Project Context",
    "",
    `Project: ${project.name}`,
    `ID: ${project.id}`,
    `Status: ${formatStatus(project.status)}`,
    `Provider: ${formatProvider(project.provider)}`,
  ];

  if (project.repositoryUrl) {
    lines.push(`Repository: ${project.repositoryUrl}`);
  }
  if (project.defaultBranch) {
    lines.push(`Default branch: ${project.defaultBranch}`);
  }
  if (project.description) {
    lines.push(`Description: ${project.description}`);
  }

  lines.push("");

  if (latestImport) {
    lines.push("## Latest Import");
    lines.push(`Status: ${formatStatus(latestImport.status)}`);
    lines.push(`Parse: ${formatStatus(latestImport.parseStatus)}`);
    if (latestImport.branch) lines.push(`Branch: ${latestImport.branch}`);
    if (latestImport.commitSha) {
      lines.push(`Commit: ${latestImport.commitSha.slice(0, 8)}`);
    }
    if (latestImport.completedAt) {
      lines.push(
        `Completed: ${new Date(latestImport.completedAt).toLocaleString()}`,
      );
    }
    if (latestImport.errorMessage) {
      lines.push(`Import error: ${latestImport.errorMessage}`);
    }
    if (latestImport.parseError) {
      lines.push(`Parse error: ${latestImport.parseError}`);
    }
  } else {
    lines.push("## Import Status");
    lines.push("No imports found. Run trigger_reimport to index the codebase.");
  }

  lines.push("");
  lines.push("## Available Tools");
  lines.push("- list_projects — list all accessible projects");
  lines.push("- get_project — get current project status and metadata");
  lines.push("- get_project_map — browse the full file tree");
  lines.push("- search_codebase — find files, symbols, and exports by keyword; results include symbol signatures");
  lines.push("- get_file — read a file: content, symbol outline, and/or blast radius (impact analysis). Auto-reparses if local file has changed since last import.");
  lines.push("- get_project_insights — full codebase health report: cycles, entry points, orphans, top files");
  lines.push("- get_diff — show git diff between two refs (commits, branches, tags); useful for understanding recent changes");
  lines.push("- trigger_reimport — re-index the codebase after code changes");
  lines.push("- wait_for_import — wait until an import finishes");

  lines.push("");
  lines.push("## Instructions");

  if (
    project.status === "ready" &&
    latestImport?.parseStatus === "completed"
  ) {
    lines.push(
      "The codebase is fully indexed. Use search_codebase to locate files and " +
        "symbols before answering questions about the code.",
    );
  } else if (project.status === "importing") {
    lines.push(
      "An import is currently in progress. Use wait_for_import to wait until " +
        "it completes before searching the codebase.",
    );
  } else if (
    project.status === "ready" &&
    latestImport?.parseStatus !== "completed"
  ) {
    lines.push(
      "The codebase snapshot is ready but semantic analysis is still running " +
        `(parse status: ${latestImport?.parseStatus ?? "unknown"}). ` +
        "File search is available but symbol/export results may be incomplete.",
    );
  } else {
    lines.push(
      "The project has not been fully imported yet. Run trigger_reimport to " +
        "index the codebase.",
    );
  }

  return lines.join("\n");
}

export function registerProjectContextResource(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerResource(
    "project-context",
    RESOURCE_URI,
    {
      title: "CodeMap Project Context",
      description:
        "Current state of the linked CodeMap project: import status, parse status, " +
        "and instructions for searching the codebase. Read this resource at the start " +
        "of every session to understand the project before answering questions about the code.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const projectId = await readWorkspaceProjectId();

      if (!projectId) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: [
                "# CodeMap Project Context",
                "",
                "No project linked to this workspace.",
                "",
                "Run one of the following tools to link a project:",
                "- create_project — import a local folder",
                "- create_project_from_github — import a GitHub repository",
              ].join("\n"),
            },
          ],
        };
      }

      let project: ProjectDetail;
      let imports: ProjectImportDetail[];

      try {
        [project, imports] = await Promise.all([
          client.request<ProjectDetail>(
            `/projects/${encodeURIComponent(projectId)}`,
            { authRequired: true },
          ),
          client.request<ProjectImportDetail[]>(
            `/projects/${encodeURIComponent(projectId)}/imports`,
            { authRequired: true },
          ),
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `# CodeMap Project Context\n\nFailed to load project context: ${message}`,
            },
          ],
        };
      }

      const latestImport = imports[0] ?? null;

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: buildContextText(project, latestImport),
          },
        ],
      };
    },
  );
}
