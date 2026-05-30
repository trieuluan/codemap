#!/usr/bin/env node

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../package.json") as { version: string };
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "@codemap/core/config.js";
import { buildServerInstructions } from "@codemap/core/lib/server-instructions.js";
import { buildSessionContext } from "@codemap/core/lib/session-context.js";
import { autoInjectRules } from "@codemap/core/lib/auto-inject.js";

import { registerManageGitConnectionTool } from "./tools/manage-git-connection.js";
import { registerGetCurrentWorkspaceInfoTool } from "./tools/get-current-workspace-info.js";
import { registerListRepositoriesTool } from "./tools/list-repositories.js";
import { registerCreateProjectTool } from "./tools/create-project.js";
import { registerLinkProjectTool } from "./tools/link-project.js";
import { registerReimportTool } from "./tools/reimport.js";
import { registerGetProjectTool } from "./tools/get-project.js";
import { registerSearchCodebaseTool } from "./tools/search-codebase.js";
import { registerSymbolTool } from "./tools/symbol.js";
import { registerWebFetchTool } from "./tools/web-fetch.js";
import { registerFindRelatedFilesTool } from "./tools/find-related-files.js";
import { registerRefreshLocalIndexTool } from "./tools/refresh-local-index.js";
import { registerGetFileTool } from "./tools/get-file.js";
import { registerMoveSymbolsTool } from "./tools/move-symbols.js";
import { registerRenameSymbolTool } from "./tools/rename-symbol.js";
import { registerDiffTool } from "./tools/diff.js";
import { registerGetProjectMapTool } from "./tools/get-project-map.js";
import { registerListProjectsTool } from "./tools/list-projects.js";
import { registerGetProjectInsightsTool } from "./tools/get-project-insights.js";
import { registerProjectContextResource } from "./resources/project-context.js";
import { registerAgentRuleResources } from "./resources/agent-rules.js";
import { registerCheckAuthStatusTool } from "./tools/check-auth-status.js";
import { registerLoginTool } from "./tools/login.js";
import { registerLogoutTool } from "./tools/logout.js";
import { registerWebSearchTool } from "./tools/web-search.js";
import { registerExploreTaskTool } from "./tools/explore-task.js";

async function runMcpServer() {
  const config = await loadConfig();
  const server = new McpServer(
    { name: "codemap-mcp-server", version: SERVER_VERSION },
    { instructions: buildServerInstructions() },
  );

  const { toolMode } = config;

  // ── Lite tier: core exploration + auth (always registered) ──────────────
  registerCheckAuthStatusTool(server, config);
  registerLoginTool(server, config);
  registerLogoutTool(server, config);
  registerGetProjectTool(server, config);
  registerLinkProjectTool(server, config);
  registerExploreTaskTool(server, config);
  registerSearchCodebaseTool(server, config);
  registerSymbolTool(server, config);
  registerGetFileTool(server, config);

  registerGetProjectMapTool(server, config);
  registerDiffTool(server, config);
  registerRefreshLocalIndexTool(server);
  registerWebSearchTool(server);
  registerReimportTool(server, config);

  // ── Standard tier: deeper analysis + project management ─────────────────
  if (toolMode === "standard" || toolMode === "full") {
    registerGetProjectInsightsTool(server, config);
    registerWebFetchTool(server, config);
    registerFindRelatedFilesTool(server, config);
    registerCreateProjectTool(server, config);
    registerListProjectsTool(server, config);
  }

  // ── Full tier: refactoring, CI/CD, integrations ──────────────────────────
  if (toolMode === "full") {
    registerMoveSymbolsTool(server, config);
    registerRenameSymbolTool(server, config);
    registerManageGitConnectionTool(server, config);
    registerGetCurrentWorkspaceInfoTool(server);
    registerListRepositoriesTool(server, config);
  }

  // Resources — automatically surfaced to Claude as session context
  registerProjectContextResource(server, config);
  registerAgentRuleResources(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Auto-inject after connect — clientInfo is available now from MCP initialize handshake
  await autoInjectRules(server, process.cwd());

  // Push session context to stderr — Claude Code hooks and other agents read this
  const sessionCtx = await buildSessionContext(process.cwd()).catch(() => null);
  if (sessionCtx) process.stderr.write(sessionCtx + "\n");

  // Graceful shutdown handlers to avoid native mutex lock errors
  const shutdown = () => {
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGHUP", shutdown);
}

async function main() {
  // Piped stdin (spawned as MCP server child by MCPClient) → MCP server mode.
  if (!process.stdin.isTTY) {
    await runMcpServer();
    return;
  }

  // TTY with unknown command → also run as MCP server (legacy compat)
  await runMcpServer();
}

main().catch((error: unknown) => {
  console.error(
    "CodeMap MCP server failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
