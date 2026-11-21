import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureLocalIndexWithSummary } from "@codemap-ai/core/lib/local-index.js";

const RESOURCE_URI = "codemap://project/context";

export function registerProjectContextResource(server: McpServer) {
  server.registerResource(
    "project-context",
    RESOURCE_URI,
    {
      title: "CodeMap Local Project Context",
      description:
        "Local SQLite index summary and workflow instructions for CodeMap MCP tools.",
      mimeType: "text/plain",
    },
    async (uri) => {
      const { store, summary } = await ensureLocalIndexWithSummary();
      const meta = store.getMeta();
      const name = meta?.workspaceRootPath
        ? path.basename(meta.workspaceRootPath)
        : "workspace";

      const text = [
        `# CodeMap Local Context: ${name}`,
        `Root: ${meta?.workspaceRootPath ?? process.cwd()}`,
        `Indexed files: ${summary.fileCount} | Symbols: ${summary.symbolCount} | Stale: ${summary.stale}`,
        "",
        "Use `explore_task`, `search_codebase`, `find_related_files`, `get_file`, `symbol`, `get_project_map`, and `diff` instead of raw grep/full-file reads.",
      ].join("\n");

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text,
          },
        ],
      };
    },
  );
}
