import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildLocalIndex, ensureLocalIndex, getLocalIndexSummary } from "../lib/local-index.js";
import { success, withToolError } from "../lib/tool-response.js";

export function registerRefreshLocalIndexTool(server: McpServer) {
  server.registerTool(
    "refresh_local_index",
    {
      title: "Refresh Local Index",
      description:
        "Refreshes the local SQLite CodeMap index for the current workspace. " +
        "This is local-only: it reads files from disk, does not require authentication, " +
        "does not call the CodeMap API, and does not update web graph/insights. " +
        "Use reimport when a paid workspace needs cloud indexing for the web app.",
      inputSchema: {
        force: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "When true, rebuilds the local index even if it appears fresh. Defaults to true.",
          ),
      },
    },
    withToolError(async ({ force }) => {
      const startedAt = performance.now();
      const store = force
        ? await buildLocalIndex()
        : await ensureLocalIndex({ force: false });
      const summary = await getLocalIndexSummary(store);
      const elapsedMs = Math.round(performance.now() - startedAt);

      const output = [
        "Local CodeMap index refreshed.",
        `Workspace: ${summary.workspaceRootPath}`,
        `Cache: ${summary.cachePath}`,
        `Files: ${summary.fileCount}`,
        `Symbols: ${summary.symbolCount}`,
        `Stale: ${summary.stale ? "yes" : "no"}`,
        `Elapsed: ${elapsedMs}ms`,
        "",
        "This updated only the MCP local index. Use reimport to update cloud indexing, web graph, and insights.",
      ].join("\n");

      return success(output, {
        status: "completed",
        mode: "local",
        workspacePath: summary.workspaceRootPath,
        cachePath: summary.cachePath,
        fileCount: summary.fileCount,
        symbolCount: summary.symbolCount,
        stale: summary.stale,
        elapsedMs,
        suggestedNextTools: ["diff()"],
      });
    }),
  );
}
