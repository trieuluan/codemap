import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorContent, success } from "../lib/tool-response.js";
import { resolveWorkspace } from "../lib/workspace-resolver.js";

export function registerGetCurrentWorkspaceInfoTool(server: McpServer) {
  server.registerTool(
    "get_current_workspace_info",
    {
      title: "Get Current Workspace Info",
      description:
        "Returns the current Git workspace root, repo name, branch, commit SHA, and origin remote URL if available. " +
        "Use this before creating a CodeMap project from the current workspace.",
      inputSchema: {},
    },
    async () => {
      try {
        const resolvedWorkspace = await resolveWorkspace();
        const { workspace } = resolvedWorkspace;

        if (!workspace) {
          return success(
            "No Git workspace detected. Project creation can still use upload flow if create_project is called with upload confirmation.",
            {
              detected: false,
              workspace: null,
              workspaceRootPath: resolvedWorkspace.workspaceRootPath,
              resolution: resolvedWorkspace.resolution,
              nextAction: "create_project",
            },
          );
        }

        const summary = [
          "Current workspace Git repository detected.",
          `Repo: ${workspace.repoName}`,
          `Root: ${workspace.repoRootPath}`,
          `Branch: ${workspace.branch}`,
          `Commit: ${workspace.commitSha}`,
          workspace.remoteUrl ? `Remote: ${workspace.remoteUrl}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        return success(summary, {
          detected: true,
          workspace,
          workspaceRootPath: resolvedWorkspace.workspaceRootPath,
          resolution: resolvedWorkspace.resolution,
          nextAction: "create_project",
        });
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
