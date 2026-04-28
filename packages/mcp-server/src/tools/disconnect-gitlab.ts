import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";

export function registerDisconnectGitlabTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "disconnect_gitlab",
    {
      title: "Disconnect GitLab",
      description:
        "Removes the user's connected GitLab account from CodeMap. " +
        "After disconnecting, CodeMap will no longer be able to clone private GitLab repositories. " +
        "Only call this when the user explicitly asks to disconnect or revoke GitLab access.",
      inputSchema: {},
    },
    withToolError(async () => {
      await client.request<{ disconnected: true }>("/gitlab/disconnect", {
        method: "DELETE",
        authRequired: true,
      });

      return success(
        "GitLab account disconnected successfully. CodeMap no longer has access to the user's GitLab repositories.",
        {
          disconnected: true,
          provider: "gitlab",
        },
      );
    }),
  );
}
