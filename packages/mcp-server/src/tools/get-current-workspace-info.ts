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
        "Works without authentication or a linked project. " +
        "Use this to inspect local git state, or before creating/linking a CodeMap cloud project.",
      inputSchema: {},
    },
    async () => {
      try {
        const resolvedWorkspace = await resolveWorkspace();
        const { workspace } = resolvedWorkspace;

        if (!workspace) {
          return success(
            "No Git workspace detected. Local tools (refresh_local_index, edit_file, bash) still work. Cloud project creation can use the upload flow via create_project.",
            {
              detected: false,
              workspace: null,
              workspaceRootPath: resolvedWorkspace.workspaceRootPath,
              resolution: resolvedWorkspace.resolution,
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
        });
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
