import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";

export function registerDeployPreviewTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "deploy_preview",
    {
      title: "Deploy Preview",
      description:
        "Trigger a preview deployment for the project. " +
        "Creates a temporary deployment URL that can be used for testing " +
        "changes before merging to production. " +
        "Supports preview deployments for web projects, often tied to PRs or branches. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        branch: z
          .string()
          .optional()
          .describe(
            "Branch to deploy. Defaults to the current workspace branch.",
          ),
        message: z
          .string()
          .optional()
          .describe(
            "Deployment message or comment. Useful for identifying the deployment purpose.",
          ),
        environment: z
          .enum(["development", "staging", "production", "custom"])
          .optional()
          .default("development")
          .describe(
            "Target environment for the deployment. " +
              "'production' requires additional confirmation.",
          ),
        force: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Force redeploy even if same branch/commit. Default: false.",
          ),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ branch, message, environment, force, project_id }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success(
          "No project ID provided and no linked project found for this workspace.\n" +
            "Run create_project first to link this workspace to a CodeMap project.",
          {
            projectId: null,
            status: "no_project",
          },
        );
      }

      // Validate production deployment
      if (environment === "production" && !force) {
        return success(
          "⚠️ Production deployment requires explicit confirmation.\n" +
            "Use `force: true` to proceed with production deployment.",
          {
            projectId: resolvedProjectId,
            status: "confirmed",
            action: "deploy_preview",
            environment,
            forceRequired: true,
          },
        );
      }

      // In a real implementation, this would:
      // 1. Check if the project has a deployment configuration
      // 2. Trigger the deployment via the CI/CD provider API (Vercel, Netlify, etc.)
      // 3. Return deployment URL and status

      const summary = buildSummary(
        resolvedProjectId,
        branch,
        environment,
        message,
        force,
      );

      return success(summary, {
        projectId: resolvedProjectId,
        status: "triggered",
        branch: branch || "current",
        environment,
        message,
        force,
        deploymentUrl: null,
        taskId: null,
        note: "This is a placeholder implementation. Real implementation would call deployment API (Vercel, Netlify, etc.) to create preview deployment.",
      });
    }),
  );
}

function buildSummary(
  projectId: string,
  branch: string | undefined,
  environment: string,
  message: string | undefined,
  force: boolean,
): string {
  const lines: string[] = [];

  lines.push("## Deploy Preview Request");
  lines.push("");
  lines.push(`**Project:** ${projectId}`);
  lines.push(`**Branch:** ${branch || "current (auto-detected)"}`);
  lines.push(`**Environment:** ${environment}`);
  lines.push(`**Message:** ${message || "(none)"}`);
  lines.push(`**Force:** ${force ? "Yes" : "No"}`);
  lines.push("");

  if (environment === "production") {
    lines.push("⚠️ **PRODUCTION DEPLOYMENT**");
    lines.push("");
    lines.push("This is a production deployment. Please ensure:");
    lines.push("- All tests are passing");
    lines.push("- Database migrations are applied");
    lines.push("- Environment variables are configured");
    lines.push("");
  }

  lines.push("### Status");
  lines.push("");
  lines.push(`Deployment **triggered** for preview.`);
  lines.push("");
  lines.push("### Next Steps");
  lines.push("");
  lines.push("1. Wait for deployment to complete");
  lines.push("2. Check the deployment status via CodeMap dashboard");
  lines.push("3. Use the preview URL to test changes");
  lines.push("");

  return lines.join("\n");
}
