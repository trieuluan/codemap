import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isSupportedUrl, openUrlInBrowser } from "../lib/open-url.js";

export function registerOpenUrlTool(server: McpServer) {
  server.registerTool(
    "open_url",
    {
      title: "Open URL",
      description:
        "Opens an HTTP or HTTPS URL in the default browser of the environment where this MCP server is running. " +
        "Use this only for explicit side effects such as starting an OAuth flow after the user has asked to continue.",
      inputSchema: {
        url: z
          .string()
          .min(1)
          .refine(isSupportedUrl, "URL must be a valid http:// or https:// URL"),
      },
    },
    async ({ url }) => {
      try {
        await openUrlInBrowser(url);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to open URL. ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Opened URL in the default browser: ${url}`,
          },
        ],
      };
    },
  );
}
