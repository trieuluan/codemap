import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { text, withToolError } from "../lib/tool-response.js";

export function registerGetFileOutlineTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_file_outline",
    {
      title: "Get File Outline",
      description:
        "Returns a compact markdown outline of a source file — imports, exports, and top-level symbols with line numbers. " +
        "Use this instead of reading the raw file when you only need to understand the structure of a file. " +
        "Significantly fewer tokens than the full file content.",
      inputSchema: {
        project_id: z.string().uuid().describe("UUID of the CodeMap project"),
        file_path: z
          .string()
          .min(1)
          .max(2000)
          .describe(
            "Relative path to the file within the repository (e.g. src/modules/project/service.ts)",
          ),
      },
    },
    withToolError(async ({ project_id, file_path }) => {
      const data = await client.request<{ outline?: string }>(
        `/projects/${encodeURIComponent(project_id)}/map/files/outline`,
        {
          query: { path: file_path },
          authRequired: true,
        },
      );

      if (!data?.outline) {
        return text("No outline available for this file.");
      }

      return text(data.outline);
    }),
  );
}
