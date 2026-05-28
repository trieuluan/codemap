#!/usr/bin/env node

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const require = createRequire(import.meta.url);
const { version: SERVER_VERSION } = require("../package.json") as { version: string };
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { registerManageGitConnectionTool } from "./tools/manage-git-connection.js";
import { runLoginCommand, runLogoutCommand, runWhoAmICommand } from "./commands/auth.js";
import { runStatusCommand } from "./commands/status.js";
import { runLocalIndexCommand } from "./commands/local-index.js";
import {
  runInitAgentPackCommand,
  runDoctorAgentPackCommand,
  runAgentPackPathCommand,
  runCleanAgentPackBackupsCommand,
  runOnboardingCommand,
} from "./commands/agent-pack.js";
import {
  runSessionHintCommand,
  runPreEditCommand,
  runPreReadCommand,
  runPreBashCommand,
} from "./commands/hooks.js";
import { registerGetCurrentWorkspaceInfoTool } from "./tools/get-current-workspace-info.js";
import { registerListGithubRepositoriesTool } from "./tools/list-github-repositories.js";
import { registerCreateProjectTool } from "./tools/create-project.js";
import { registerLinkProjectTool } from "./tools/link-project.js";
import { registerReimportTool } from "./tools/reimport.js";
import { registerGetProjectTool } from "./tools/get-project.js";
import { registerSearchCodebaseTool } from "./tools/search-codebase.js";
import { registerSymbolTool } from "./tools/symbol.js";
import { registerSummarizeFeatureAreaTool } from "./tools/summarize-feature-area.js";


import { registerWebFetchTool } from "./tools/web-fetch.js";
import { registerFindRelatedFilesTool } from "./tools/find-related-files.js";
import { registerFindCyclesTool } from "./tools/find-cycles.js";
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
import { registerAgentPackResources } from "./resources/agent-pack.js";
import { registerCheckAuthStatusTool } from "./tools/check-auth-status.js";
import { registerLoginTool } from "./tools/login.js";
import { registerLogoutTool } from "./tools/logout.js";
import { registerWebSearchTool } from "./tools/web-search.js";
import { registerExploreTaskTool } from "./tools/explore-task.js";
import { buildServerInstructions } from "./lib/server-instructions.js";
import { buildSessionContext } from "./lib/session-context.js";
import { autoInjectRules } from "./lib/auto-inject.js";
import { parseArgs } from "./cli-agent/args.js";
import { createBaseContext } from "./cli-agent/command-context.js";
import { loadGatewayConfig } from "./cli-agent/config.js";
import { loadDotEnv } from "./cli-agent/env.js";
import { runAsk } from "./commands/ask.js";
import { runChat } from "./commands/chat.js";
import { runDoctor } from "./commands/doctor.js";
import { runHelp } from "./commands/help.js";
import { runInitGateway } from "./commands/init-gateway.js";
import { runModels } from "./commands/models.js";
import { runRouteCommand } from "./commands/route.js";

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
    registerSummarizeFeatureAreaTool(server, config);
    registerCreateProjectTool(server, config);
    registerListProjectsTool(server, config);
  }

  // ── Full tier: refactoring, CI/CD, integrations ──────────────────────────
  if (toolMode === "full") {
    registerMoveSymbolsTool(server, config);
    registerRenameSymbolTool(server, config);
    registerFindCyclesTool(server, config);
    registerManageGitConnectionTool(server, config);
    registerGetCurrentWorkspaceInfoTool(server);
    registerListGithubRepositoriesTool(server, config);
  }

  // Resources — automatically surfaced to Claude as session context
  registerProjectContextResource(server, config);
  registerAgentRuleResources(server);
  registerAgentPackResources(server);

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
  const command = process.argv[2];

  // Piped stdin (spawned as MCP server child by MCPClient) → MCP server mode.
  if (!command && !process.stdin.isTTY) {
    await runMcpServer();
    return;
  }

  await loadDotEnv();

  const argv = process.argv.slice(2);

  // --help / -h flags
  if (command === "--help" || command === "-h") {
    const parsed = parseArgs(["help"]);
    runHelp(createBaseContext(["help"], parsed, SERVER_VERSION));
    return;
  }

  // Gateway commands: need LLM gateway config (profiles, model routing)
  const GATEWAY_COMMANDS = new Set(["chat", "ask", "route", "models", "doctor", "init-gateway", "help"]);
  if (!command || GATEWAY_COMMANDS.has(command)) {
    const parsed = parseArgs(argv);
    const baseCtx = createBaseContext(argv, parsed, SERVER_VERSION);

    if (parsed.command === "help") {
      runHelp(baseCtx);
      return;
    }
    if (parsed.command === "init-gateway") {
      await runInitGateway(baseCtx);
      return;
    }

    const config = await loadGatewayConfig();
    const ctx = { ...baseCtx, config };

    switch (parsed.command) {
      case "chat": await runChat(ctx); return;
      case "ask": await runAsk(ctx); return;
      case "route": runRouteCommand(ctx); return;
      case "models": await runModels(ctx); return;
      case "doctor": await runDoctor(ctx); return;
    }
    return;
  }

  // Utility commands: auth, workspace, hooks — don't need gateway config
  switch (command) {
    case "login":
      await runLoginCommand();
      return;
    case "logout":
      await runLogoutCommand();
      return;
    case "whoami":
      await runWhoAmICommand();
      return;
    case "status":
      await runStatusCommand();
      return;
    case "init-agent-pack":
      await runInitAgentPackCommand(process.argv.slice(3));
      return;
    case "doctor-agent-pack":
      await runDoctorAgentPackCommand(process.argv.slice(3));
      return;
    case "agent-pack-path":
      runAgentPackPathCommand();
      return;
    case "clean-agent-pack-backups":
      runCleanAgentPackBackupsCommand(process.argv.slice(3));
      return;
    case "local-index":
      await runLocalIndexCommand(process.argv.slice(3));
      return;
    case "session-hint":
      await runSessionHintCommand();
      return;
    case "pre-edit":
      await runPreEditCommand(process.argv.slice(3));
      return;
    case "pre-read":
      await runPreReadCommand();
      return;
    case "pre-bash":
      await runPreBashCommand();
      return;
    case "onboarding":
      runOnboardingCommand(process.argv.slice(3));
      return;
    default:
      if (!process.stdin.isTTY) {
        // Piped stdin with unknown command → legacy MCP server compat
        await runMcpServer();
      } else {
        console.error(`Unknown command: "${command}". Run "codemap help" for usage.`);
        process.exitCode = 1;
      }
  }
}

main().catch((error: unknown) => {
  console.error(
    "CodeMap MCP server failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
