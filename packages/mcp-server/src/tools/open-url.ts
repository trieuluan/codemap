import { spawn } from "node:child_process";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function isSupportedUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getOpenCommand(url: string) {
  switch (process.platform) {
    case "darwin":
      return {
        command: "open",
        args: [url],
      };
    case "win32":
      return {
        command: "cmd",
        args: ["/c", "start", "", url],
      };
    default:
      return {
        command: "xdg-open",
        args: [url],
      };
  }
}

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
      const launcher = getOpenCommand(url);

      try {
        const child = spawn(launcher.command, launcher.args, {
          detached: true,
          stdio: "ignore",
        });

        child.unref();
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
