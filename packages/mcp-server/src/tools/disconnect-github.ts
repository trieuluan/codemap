import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";

export function registerDisconnectGithubTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "disconnect_github",
    {
      title: "Disconnect GitHub",
      description:
        "Removes the user's connected GitHub account from CodeMap. " +
        "After disconnecting, CodeMap will no longer be able to clone private repositories. " +
        "Only call this when the user explicitly asks to disconnect or revoke GitHub access.",
      inputSchema: {},
    },
    withToolError(async () => {
      await client.request<{ disconnected: true }>("/github/disconnect", {
        method: "DELETE",
        authRequired: true,
      });

      return success(
        "GitHub account disconnected successfully. CodeMap no longer has access to the user's GitHub repositories.",
        {
          disconnected: true,
          provider: "github",
        },
      );
    }),
  );
}
