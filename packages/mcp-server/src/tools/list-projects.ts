import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import type { Project, ProjectImportDetail } from "../lib/api-types.js";
import { buildImportHealth, formatShortCommit } from "../lib/import-health.js";
import { resolveWorkspace } from "../lib/workspace-resolver.js";

interface ProjectListItem extends Project {
  latestImport?: ProjectImportDetail | null;
  health?: ReturnType<typeof buildImportHealth>;
}

function formatProject(p: ProjectListItem, index: number): string {
  const lines: string[] = [
    `${index + 1}. ${p.name} (${p.status})`,
    `   ID: ${p.id}`,
  ];

  if (p.provider === "github" && p.repositoryUrl) {
    lines.push(`   Repository: ${p.repositoryUrl}`);
  } else if (p.provider === "local_workspace") {
    lines.push(`   Provider: local workspace`);
  }

  if (p.defaultBranch) lines.push(`   Branch: ${p.defaultBranch}`);

  if (p.latestImport) {
    const imp = p.latestImport;
    const parseInfo =
      imp.parseStatus && imp.parseStatus !== imp.status
        ? `, parse: ${imp.parseStatus}`
        : "";
    lines.push(`   Latest import: ${imp.status}${parseInfo}`);
    if (imp.commitSha) lines.push(`   Import commit: ${formatShortCommit(imp.commitSha)}`);
    if (imp.completedAt) {
      lines.push(
        `   Last imported: ${new Date(imp.completedAt).toLocaleString()}`,
      );
    }
  } else {
    lines.push("   Latest import: none");
  }

  if (p.health) {
    lines.push(`   Index health: ${p.health.state}`);
    if (p.health.commitComparison.status === "different") {
      lines.push("   Local commit differs from indexed commit.");
    }
    if (p.health.nextAction !== "none") {
      lines.push(`   Next action: ${p.health.nextAction}`);
    }
  }

  return lines.join("\n");
}

export function registerListProjectsTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "list_projects",
    {
      title: "List Projects",
      description:
        "Lists all CodeMap projects accessible to the authenticated user, " +
        "including their status, provider, and latest import state.",
      inputSchema: {
        status: z
          .enum(["draft", "importing", "ready", "failed", "archived"])
          .optional()
          .describe("Filter projects by status. Omit to return all."),
      },
    },
    withToolError(async ({ status }) => {
      const projects = await client.request<ProjectListItem[]>(
        "/projects",
        {
          authRequired: true,
          query: { include: "latestImport" },
        },
      );

      const filtered = status
        ? projects.filter((p) => p.status === status)
        : projects;

      if (filtered.length === 0) {
        const summary = status
            ? `No projects with status "${status}" found.`
            : "No projects found. Create one with create_project or create_project_from_github.";

        return success(summary, {
          items: [],
          total: 0,
          statusFilter: status ?? null,
        });
      }

      const resolvedWorkspace = await resolveWorkspace();
      const items = filtered.map((project) => ({
        ...project,
        health: buildImportHealth({
          latestImport: project.latestImport ?? null,
          workspace: resolvedWorkspace.workspace,
          workspaceResolution: resolvedWorkspace.resolution,
          project,
        }),
      }));

      const header = `${items.length} project${items.length !== 1 ? "s" : ""}${status ? ` (${status})` : ""}`;
      const body = items.map(formatProject).join("\n\n");

      return success(`${header}\n\n${body}`, {
        items,
        total: items.length,
        statusFilter: status ?? null,
      });
    }),
  );
}
