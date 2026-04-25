import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { getMcpWhoAmI } from "../lib/mcp-auth.js";
import { success, errorContent } from "../lib/tool-response.js";

export function registerCheckAuthStatusTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "check_auth_status",
    {
      title: "Check Auth Status",
      description:
        "Checks whether this CodeMap MCP server is authenticated with CodeMap and which user it is currently using.",
      inputSchema: {},
    },
    async () => {
      if (!config.apiToken) {
        const summary =
          `Not authenticated.\nAPI URL: ${config.apiUrl}\n` +
          "Call `start_auth_flow` to begin browser login, then `wait_for_auth` after the user completes authorization. " +
          "For CLI usage, run `codemap-mcp login`.";

        return success(summary, {
          authenticated: false,
          apiUrl: config.apiUrl,
          user: null,
          loginRequired: true,
        });
      }

      try {
        const response = await getMcpWhoAmI(client);
        const summary = [
          "Authenticated with CodeMap.",
          `API URL: ${response.apiUrl}`,
          response.user.email ? `Email: ${response.user.email}` : null,
          response.user.name ? `Name: ${response.user.name}` : null,
          response.user.id ? `User ID: ${response.user.id}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        return success(summary, {
          authenticated: true,
          apiUrl: response.apiUrl,
          user: response.user,
          loginRequired: false,
        });
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
