import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCurrentWorkspaceInfo } from "../lib/workspace-git.js";

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
        const workspace = await getCurrentWorkspaceInfo();

        return {
          content: [
            {
              type: "text",
              text: [
                "Current workspace Git repository detected.",
                `Repo: ${workspace.repoName}`,
                `Root: ${workspace.repoRootPath}`,
                `Branch: ${workspace.branch}`,
                `Commit: ${workspace.commitSha}`,
                workspace.remoteUrl ? `Remote: ${workspace.remoteUrl}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
