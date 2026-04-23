import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpServerConfig } from "../config.js";

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
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "pong from CodeMap MCP server",
              apiConfigured: Boolean(config.apiUrl),
              tokenConfigured: Boolean(config.apiToken),
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}
