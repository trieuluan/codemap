import { performance } from "node:perf_hooks";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { 
  enableAutoIndexing, 
  disableAutoIndexing, 
  isAutoIndexingActive
} from "@codemap-ai/core/lib/auto-indexing.js";
import { ensureLocalIndex, getLocalIndexSummary } from "@codemap-ai/core/lib/local-index.js";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";

export function registerEnableAutoIndexingTool(server: McpServer) {
  server.registerTool(
    "enable_auto_indexing",
    {
      title: "Enable Auto Indexing",
      description:
        "Enables automatic file watching and index refresh for the current workspace. " +
        "When enabled, CodeMap will automatically reindex files when they change, " +
        "keeping your local SQLite index up-to-date without manual intervention.",
      inputSchema: {},
    },
    withToolError(async () => {
      const startedAt = performance.now();
      
      // Get workspace root and store
      const workspaceRoot = process.cwd();
      const store = await ensureLocalIndex({ force: false });
      
      // Enable auto indexing
      await enableAutoIndexing(store, workspaceRoot);
      
      const elapsedMs = Math.round(performance.now() - startedAt);
      
      const summary = await getLocalIndexSummary(store);
      
      const output = [
        "Auto-indexing enabled successfully.",
        `Workspace: ${workspaceRoot}`,
        "",
        "Current index status:",
        `  Files: ${summary.fileCount}`,
        `  Symbols: ${summary.symbolCount}`,
        `  Stale: ${summary.stale ? "yes" : "no"}`,
        "",
        "The index will now automatically update when files change.",
      ].join("\n");

      return success(output, {
        status: "completed",
        mode: "local",
        workspacePath: workspaceRoot,
        fileCount: summary.fileCount,
        symbolCount: summary.symbolCount,
        stale: summary.stale,
        elapsedMs,
        suggestedNextTools: ["diff()", "get_project_map()"]
      });
    }),
  );
}

export function registerDisableAutoIndexingTool(server: McpServer) {
  server.registerTool(
    "disable_auto_indexing",
    {
      title: "Disable Auto Indexing",
      description:
        "Disables automatic file watching and index refresh for the current workspace. " +
        "After disabling, you'll need to manually refresh the index when files change " +
        "using 'refresh_local_index'.",
      inputSchema: {},
    },
    withToolError(async () => {
      const startedAt = performance.now();
      
      // Disable auto indexing
      disableAutoIndexing();
      
      const elapsedMs = Math.round(performance.now() - startedAt);
      
      const output = [
        "Auto-indexing disabled successfully.",
        "The file watcher has been stopped.",
        "",
        "To enable again in the future, use 'enable_auto_indexing'.",
        "To manually refresh the index when needed, use 'refresh_local_index'.",
      ].join("\n");

      return success(output, {
        status: "completed",
        mode: "local",
        elapsedMs,
        suggestedNextTools: ["refresh_local_index(force=true)"]
      });
    }),
  );
}

export function registerCheckAutoIndexStatusTool(server: McpServer) {
  server.registerTool(
    "check_auto_index_status",
    {
      title: "Check Auto Index Status",
      description:
        "Checks the current status of automatic file watching and index refresh. " +
        "Returns whether auto-indexing is active, the workspace being watched, " +
        "and current index statistics.",
      inputSchema: {},
    },
    withToolError(async () => {
      const startedAt = performance.now();
      
      const isActive = isAutoIndexingActive();
      const workspaceRoot = process.cwd();
      
      let statusInfo = [
        "Auto-indexing status report:",
        `  Active: ${isActive ? "Yes ✓" : "No ✗"}`,
        `  Workspace: ${workspaceRoot}`,
      ];
      
      if (isActive) {
        statusInfo.push("");
        statusInfo.push("Auto-indexing is running. Files will be automatically reindexed when changed.");
        statusInfo.push("Tip: Use 'disable_auto_indexing' to stop watching or 'refresh_local_index' for manual refresh.");
      } else {
        statusInfo.push("");
        statusInfo.push("Auto-indexing is disabled. Use 'enable_auto_indexing' to start watching files automatically.");
        statusInfo.push("Tip: You can still manually refresh using 'refresh_local_index'.");
      }
      
      const elapsedMs = Math.round(performance.now() - startedAt);

      return success(statusInfo.join("\n"), {
        status: "completed",
        mode: "local",
        workspacePath: workspaceRoot,
        isActive,
        elapsedMs,
        suggestedNextTools: [
          isActive ? "disable_auto_indexing()" : "enable_auto_indexing()",
          "refresh_local_index(force=true)"
        ]
      });
    }),
  );
}
