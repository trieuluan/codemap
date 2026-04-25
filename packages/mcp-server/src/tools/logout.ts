import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clearGlobalAuthConfig, type McpServerConfig } from "../config.js";
import { errorContent, success } from "../lib/tool-response.js";

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
        const data = {
          authenticated: false,
          apiUrl: config.apiUrl,
          message: "Cleared stored CodeMap MCP credentials.",
        };

        return success(JSON.stringify(data, null, 2), data);
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
