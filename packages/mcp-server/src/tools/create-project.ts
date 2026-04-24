import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { text, withToolError } from "../lib/tool-response.js";
import { tryGetCurrentWorkspaceInfo } from "../lib/workspace-git.js";
import { zipWorkspaceFolder } from "../lib/workspace-zip.js";
import type { GithubStatus, ProjectSourceImportResult } from "../lib/api-types.js";

export function registerCreateProjectTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "create_project",
    {
      title: "Create Project",
      description:
        "Smart entry point for creating a CodeMap project from the current workspace. " +
        "If the workspace has a git remote URL, CodeMap will clone it directly from the remote (use create_project_from_github for more control). " +
        "If there is no git remote — or no git at all — the workspace folder will be zipped and uploaded to CodeMap for analysis. " +
        "Sensitive files (.env*, *.pem, *.key, .aws/, .ssh/, secrets.*, etc.) and artifact directories (node_modules, dist, .next, etc.) " +
        "are automatically excluded before upload. " +
        "For the upload path, the tool will ask the user to confirm before sending any code.",
      inputSchema: {
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        branch: z.string().trim().min(1).max(255).optional(),
        upload_confirmed: z
          .boolean()
          .optional()
          .describe(
            "Set to true only after the user has explicitly agreed to upload the source code to CodeMap.",
          ),
      },
    },
    withToolError(async ({ name, description, branch, upload_confirmed }) => {
      const workspace = await tryGetCurrentWorkspaceInfo();

      // ── Path A: workspace has a git remote → clone flow ────────────────────
      if (workspace?.remoteUrl) {
        const githubStatus = await client.request<GithubStatus>("/github/status", {
          authRequired: true,
        });

        if (!githubStatus.connected) {
          return text(
            [
              "GitHub is not connected to this CodeMap account.",
              "",
              "For private repositories, please connect GitHub first:",
              "  1. Call get_github_connect_url — it will open the browser automatically.",
              "  2. Complete the authorization flow.",
              "  3. Call create_project again.",
              "",
              "If the repository is public, you can also call create_project_from_github directly",
              `with repository_url: "${workspace.remoteUrl}".`,
            ].join("\n"),
          );
        }

        const result = await client.request<ProjectSourceImportResult>(
          "/projects/from-github",
          {
            method: "POST",
            body: {
              repositoryUrl: workspace.remoteUrl,
              name,
              description,
              defaultBranch: workspace.branch,
              branch: branch ?? workspace.branch,
            },
            authRequired: true,
          },
        );

        return text(
          [
            "Project import started from GitHub repository.",
            `Project: ${result.project.name} (${result.project.id})`,
            `Repository: ${workspace.remoteUrl}`,
            `Branch: ${result.import.branch ?? workspace.branch}`,
            `Import status: ${result.import.status}`,
            `Parse status: ${result.import.parseStatus}`,
          ].join("\n"),
        );
      }

      // ── Path B: no git remote → upload flow ────────────────────────────────
      const folderPath = workspace?.repoRootPath ?? process.cwd();
      const folderName = name ?? path.basename(folderPath) ?? "uploaded-project";

      if (!upload_confirmed) {
        return text(
          [
            `This workspace has no git remote (${folderPath}).`,
            "CodeMap needs to upload the source code to analyze it.",
            "",
            "The following will be automatically excluded before upload:",
            "  • Artifact directories: node_modules, dist, build, .next, .git, coverage, .turbo, etc.",
            "  • Sensitive files: .env*, *.pem, *.key, *.p12, *.pfx, *.keystore, secrets.*, credentials.*, etc.",
            "  • Sensitive directories: .aws/, .ssh/, .gnupg/",
            "  • Files listed in .gitignore",
            "",
            "Do you consent to uploading this source code to CodeMap for analysis?",
            "Call create_project again with upload_confirmed: true to proceed.",
          ].join("\n"),
        );
      }

      // User confirmed — zip and upload
      const { buffer, addedCount, skippedSensitive } = await zipWorkspaceFolder(folderPath);

      if (addedCount === 0) {
        return text(
          "No files to upload after applying exclusion filters. Check that the workspace folder contains source files.",
        );
      }

      const query: Record<string, string | undefined> = {
        name: folderName,
        description,
        branch,
      };

      const result = await client.upload<ProjectSourceImportResult>(
        "/projects/from-upload",
        buffer,
        { query, authRequired: true },
      );

      return text(
        [
          "Source code uploaded and project import started.",
          `Project: ${result.project.name} (${result.project.id})`,
          `Files included: ${addedCount}`,
          skippedSensitive.length > 0
            ? `Excluded sensitive files/dirs: ${skippedSensitive.join(", ")}`
            : null,
          `Branch: ${result.import.branch ?? branch ?? "main"}`,
          `Import status: ${result.import.status}`,
          `Parse status: ${result.import.parseStatus}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }),
  );
}
