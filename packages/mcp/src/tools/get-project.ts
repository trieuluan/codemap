import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureLocalIndexWithSummary } from "@codemap-ai/core/lib/local-index.js";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";

export function registerGetProjectTool(server: McpServer) {
  server.registerTool(
    "get_project",
    {
      title: "Get Project Overview",
      description:
        "Returns local workspace overview, index status, language breakdown, and file/symbol/import counts.",
      inputSchema: {},
    },
    withToolError(async () => {
      const { store, summary } = await ensureLocalIndexWithSummary();
      const meta = store.getMeta();
      const allPaths = store.getAllFilePaths();

      const topDirs = new Map<string, number>();
      for (const p of allPaths) {
        const seg = p.includes("/") ? p.split("/")[0]! : "(root)";
        topDirs.set(seg, (topDirs.get(seg) ?? 0) + 1);
      }

      const dirLines = [...topDirs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([dir, count]) => `  - ${dir}: ${count} files`)
        .join("\n");

      const rootName = meta?.workspaceRootPath
        ? path.basename(meta.workspaceRootPath)
        : "workspace";

      const files = store.listFiles(5000);
      const langCounts = new Map<string, number>();
      for (const f of files) {
        if (f.language) langCounts.set(f.language, (langCounts.get(f.language) ?? 0) + 1);
      }
      const topLanguages = [...langCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([l, c]) => `${l} (${c})`);

      const text = [
        `Workspace: ${rootName} (${meta?.workspaceRootPath ?? "local"})`,
        `Indexed files: ${summary.fileCount} | Symbols: ${summary.symbolCount}`,
        `Languages: ${topLanguages.join(", ") || "none"}`,
        `Commit: ${meta?.commitSha ?? "unknown"} | Indexed at: ${meta?.indexedAt ?? "now"}`,
        dirLines ? `Top directories:\n${dirLines}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return success(text, {
        workspaceRootPath: meta?.workspaceRootPath ?? null,
        commitSha: meta?.commitSha ?? null,
        indexedAt: meta?.indexedAt ?? null,
        summary,
        topDirectories: Object.fromEntries(topDirs),
      });
    }),
  );
}
