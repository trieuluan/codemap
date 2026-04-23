import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { requestCodeMapApi, toToolErrorContent } from "../lib/codemap-api.js";
import { getCurrentWorkspaceInfo } from "../lib/workspace-git.js";

interface ProjectSummary {
  id: string;
  name: string;
  provider: "github" | "local_workspace" | null;
  repositoryUrl: string | null;
  localWorkspacePath: string | null;
}

interface ProjectImportSummary {
  id: string;
  status: string;
  branch: string | null;
  parseStatus: string;
}

interface ProjectSourceImportResult {
  project: ProjectSummary;
  import: ProjectImportSummary;
}

export function registerCreateProjectFromWorkspaceTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "create_project_from_workspace",
    {
      title: "Create Project From Workspace",
      description:
        "Creates or reuses a CodeMap project from the current Git workspace, then starts import and parse automatically. " +
        "Use this when the user wants to analyze the repo currently open in the AI workspace.",
      inputSchema: {
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        branch: z.string().trim().min(1).max(255).optional(),
      },
    },
    async ({ name, description, branch }) => {
      try {
        const workspace = await getCurrentWorkspaceInfo();
        const result = await requestCodeMapApi<ProjectSourceImportResult>(
          config,
          "/projects/from-workspace",
          {
            method: "POST",
            body: {
              name,
              description,
              localWorkspacePath: workspace.repoRootPath,
              repositoryUrl: workspace.remoteUrl,
              defaultBranch: workspace.branch,
              branch: branch ?? workspace.branch,
            },
            authRequired: true,
          },
        );

        return {
          content: [
            {
              type: "text",
              text: [
                "Workspace source project import started successfully.",
                `Project: ${result.project.name} (${result.project.id})`,
                `Provider: ${result.project.provider ?? "unknown"}`,
                `Workspace root: ${workspace.repoRootPath}`,
                result.project.repositoryUrl
                  ? `Remote: ${result.project.repositoryUrl}`
                  : null,
                `Import: ${result.import.id}`,
                `Branch: ${result.import.branch ?? workspace.branch}`,
                `Import status: ${result.import.status}`,
                `Parse status: ${result.import.parseStatus}`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        };
      } catch (error) {
        return toToolErrorContent(error);
      }
    },
  );
}
