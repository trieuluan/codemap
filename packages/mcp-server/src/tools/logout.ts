import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clearGlobalAuthConfig, type McpServerConfig } from "../config.js";

export function registerLogoutTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "logout",
    {
      title: "Logout",
      description:
        "Clears the locally stored CodeMap MCP credentials from global config while preserving the current API URL.",
      inputSchema: {},
    },
    async () => {
      try {
        await clearGlobalAuthConfig(config);
        config.apiToken = null;
        config.user = null;
        config.auth = null;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  authenticated: false,
                  apiUrl: config.apiUrl,
                  message: "Cleared stored CodeMap MCP credentials.",
                },
                null,
                2,
              ),
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
