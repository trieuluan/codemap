#!/usr/bin/env -S node --no-warnings --liftoff-only

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { buildServerInstructions } from "@codemap-ai/core/lib/server-instructions.js";
import { autoInjectRules } from "@codemap-ai/core/lib/auto-inject.js";
import { ensureLocalIndex } from "@codemap-ai/core/lib/local-index.js";
import { enableAutoIndexing } from "@codemap-ai/core/lib/auto-indexing.js";
import { warmLocalVectorIndex } from "@codemap-ai/core/lib/local-vector-index.js";

import { registerGetProjectTool } from "./tools/get-project.js";
import { registerGetProjectMapTool } from "./tools/get-project-map.js";
import { registerExploreTaskTool } from "./tools/explore-task.js";
import { registerSearchCodebaseTool } from "./tools/search-codebase.js";
import { registerFindRelatedFilesTool } from "./tools/find-related-files.js";
import { registerGetFileTool } from "./tools/get-file.js";
import { registerSymbolTool } from "./tools/symbol.js";
import { registerDiffTool } from "./tools/diff.js";
import { registerRefreshLocalIndexTool } from "./tools/refresh-local-index.js";
import { registerProjectContextResource } from "./resources/project-context.js";
import { registerAgentRuleResources } from "./resources/agent-rules.js";

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../package.json") as { version: string };

async function runMcpServer() {
  const server = new McpServer(
    { name: "codemap-mcp-server", version: SERVER_VERSION },
    { instructions: buildServerInstructions() },
  );

  // ── 9 focused, local-first codebase analysis tools ────────────────────────
  registerGetProjectTool(server);
  registerGetProjectMapTool(server);
  registerExploreTaskTool(server);
  registerSearchCodebaseTool(server);
  registerFindRelatedFilesTool(server);
  registerGetFileTool(server);
  registerSymbolTool(server);
  registerDiffTool(server);
  registerRefreshLocalIndexTool(server);

  registerProjectContextResource(server);
  registerAgentRuleResources(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Auto-start local index, file watcher, and background vector cache — fire-and-forget
  ensureLocalIndex({ force: false })
    .then((store) => {
      const workspaceRootPath = store.getMeta()?.workspaceRootPath;
      if (workspaceRootPath) {
        enableAutoIndexing(store, workspaceRootPath).catch(() => {});
      }
      return warmLocalVectorIndex(store);
    })
    .catch(() => {
      // Auto-start failure is non-fatal
    });

  await autoInjectRules(server, process.cwd());

  const shutdown = () => {
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGHUP", shutdown);
}

runMcpServer().catch((error: unknown) => {
  console.error(
    "CodeMap MCP server failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
