import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { requestCodeMapApi, toToolErrorContent } from "../lib/codemap-api.js";

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
      try {
        const data = await requestCodeMapApi<{ outline?: string }>(
          config,
          `/projects/${encodeURIComponent(project_id)}/map/files/outline`,
          {
            query: {
              path: file_path,
            },
            authRequired: true,
          },
        );
        const outline = data?.outline;

        if (!outline) {
          return {
            content: [{ type: "text", text: "No outline available for this file." }],
          };
        }

        return {
          content: [{ type: "text", text: outline }],
        };
      } catch (error) {
        return toToolErrorContent(error);
      }
    },
  );
}
