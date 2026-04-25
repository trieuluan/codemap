import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { startMcpLogin, tryOpenLoginBrowser } from "../lib/mcp-auth.js";
import { errorContent, success } from "../lib/tool-response.js";

export function registerStartAuthFlowTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "start_auth_flow",
    {
      title: "Start Auth Flow",
      description:
        "Starts the CodeMap MCP login flow, attempts to open the browser for authorization, and returns the auth session details needed for wait_for_auth.",
      inputSchema: {},
    },
    async () => {
      try {
        const startResponse = await startMcpLogin(client);
        const openedBrowser = await tryOpenLoginBrowser(startResponse.authorizeUrl);
        const message = openedBrowser
          ? "Browser opened for CodeMap authorization. After the user completes login, call wait_for_auth with this sessionId."
          : "Authorization URL generated. Ask the user to open the URL, then call wait_for_auth with this sessionId.";
        const data = {
          sessionId: startResponse.sessionId,
          authorizeUrl: startResponse.authorizeUrl,
          openedBrowser,
          pollIntervalMs: startResponse.pollIntervalMs,
          expiresAt: startResponse.expiresAt,
          message,
        };

        return success(JSON.stringify(data, null, 2), data);
      } catch (error) {
        return errorContent(error);
      }
    },
  );
}
