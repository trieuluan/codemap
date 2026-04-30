import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clearGlobalAuthConfig, type McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
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
        "Revokes the current MCP API key on the server and clears locally stored CodeMap credentials from global config.",
      inputSchema: {},
    },
    async () => {
      try {
        // Revoke the key on the server first (best-effort — don't block logout if it fails)
        if (config.apiToken) {
          const client = createCodeMapClient(config);
          await client
            .request("/settings/api-keys/revoke-current", {
              method: "POST",
              authRequired: true,
            })
            .catch(() => {
              // Ignore revoke errors — local cleanup proceeds regardless
            });
        }

        await clearGlobalAuthConfig(config);
        config.apiToken = null;
        config.user = null;
        config.auth = null;

        const data = {
          authenticated: false,
          apiUrl: config.apiUrl,
          message: "API key revoked and local credentials cleared.",
        };

        return success(JSON.stringify(data, null, 2), data);
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
