import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";

export function registerGetFileOutlineTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "get_file_outline",
    {
      title: "Get File Outline",
      description:
        "Returns a compact markdown outline of a source file — imports, exports, and top-level symbols with line numbers. " +
        "Use this instead of reading the raw file when you only need to understand the structure of a file. " +
        "Significantly fewer tokens than the full file content.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .describe("UUID of the CodeMap project"),
        file_path: z
          .string()
          .min(1)
          .max(2000)
          .describe(
            "Relative path to the file within the repository (e.g. src/modules/project/service.ts)",
          ),
      },
    },
    async ({ project_id, file_path }) => {
      if (!config.apiUrl) {
        return {
          content: [
            {
              type: "text",
              text: "Error: API_URL is not configured. Set the API_URL environment variable to the CodeMap API base URL.",
            },
          ],
          isError: true,
        };
      }

      const url = new URL(
        `/projects/${encodeURIComponent(project_id)}/map/files/outline`,
        config.apiUrl,
      );
      url.searchParams.set("path", file_path);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (config.apiToken) {
        headers["x-api-key"] = config.apiToken;
        headers["Authorization"] = `Bearer ${config.apiToken}`;
      }

      let response: Response;

      try {
        response = await fetch(url.toString(), { headers });
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to reach CodeMap API at ${config.apiUrl}. ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return {
          content: [
            {
              type: "text",
              text: `Error: CodeMap API returned ${response.status} ${response.statusText}. ${body}`,
            },
          ],
          isError: true,
        };
      }

      const json = (await response.json()) as {
        data?: { outline?: string };
      };

      const outline = json?.data?.outline;

      if (!outline) {
        return {
          content: [{ type: "text", text: "No outline available for this file." }],
        };
      }

      return {
        content: [{ type: "text", text: outline }],
      };
    },
  );
}
