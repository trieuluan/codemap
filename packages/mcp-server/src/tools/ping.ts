import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpServerConfig } from "../config.js";
import { success } from "../lib/tool-response.js";

export function registerPingTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Hello World test tool for the CodeMap MCP server.",
      inputSchema: {},
    },
    async () => {
      const data = {
        message: "pong from CodeMap MCP server",
        apiConfigured: Boolean(config.apiUrl),
        tokenConfigured: Boolean(config.apiToken),
      };

      return success(JSON.stringify(data, null, 2), data);
    },
  );
}
