import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { requestCodeMapApi, toToolErrorContent } from "../lib/codemap-api.js";

export function registerDisconnectGithubTool(
  server: McpServer,
  config: McpServerConfig,
) {
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
    async () => {
      try {
        await requestCodeMapApi<{ disconnected: true }>(
          config,
          "/github/disconnect",
          {
            method: "DELETE",
            authRequired: true,
          },
        );

        return {
          content: [
            {
              type: "text",
              text: "GitHub account disconnected successfully. CodeMap no longer has access to the user's GitHub repositories.",
            },
          ],
        };
      } catch (error) {
        return toToolErrorContent(error);
      }
    },
  );
}
