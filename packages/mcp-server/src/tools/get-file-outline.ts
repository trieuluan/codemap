import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { text, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";

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
        "Significantly fewer tokens than the full file content. " +
        "project_id is optional if this workspace has been linked via create_project.",
      inputSchema: {
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "UUID of the CodeMap project. Can be omitted if the workspace was linked via create_project.",
          ),
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
      const resolvedProjectId = project_id ?? await readWorkspaceProjectId();

      if (!resolvedProjectId) {
        return text(
          "No project ID provided and no linked project found for this workspace.\n" +
          "Run create_project first to link this workspace to a CodeMap project.",
        );
      }

      const data = await client.request<{ outline?: string }>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/outline`,
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
