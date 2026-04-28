#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { clearGlobalAuthConfig, loadConfig } from "./config.js";
import { createCodeMapClient } from "./lib/codemap-api.js";
import {
  getMcpWhoAmI,
  startMcpLogin,
  tryOpenLoginBrowser,
  waitForLoginAuthorization,
} from "./lib/mcp-auth.js";
import { registerPingTool } from "./tools/ping.js";
import { registerCheckGithubConnectionTool } from "./tools/check-github-connection.js";
import { registerGetGithubConnectUrlTool } from "./tools/get-github-connect-url.js";
import { registerDisconnectGithubTool } from "./tools/disconnect-github.js";
import { registerCheckGitlabConnectionTool } from "./tools/check-gitlab-connection.js";
import { registerGetGitlabConnectUrlTool } from "./tools/get-gitlab-connect-url.js";
import { registerDisconnectGitlabTool } from "./tools/disconnect-gitlab.js";
import { registerOpenUrlTool } from "./tools/open-url.js";
import { registerGetCurrentWorkspaceInfoTool } from "./tools/get-current-workspace-info.js";
import {
  registerListGithubRepositoriesTool,
  registerSearchGithubRepositoriesTool,
} from "./tools/list-github-repositories.js";
import { registerCreateProjectTool } from "./tools/create-project.js";
import { registerCreateProjectFromGithubTool } from "./tools/create-project-from-github.js";
import { registerCreateProjectFromGitlabTool } from "./tools/create-project-from-gitlab.js";
import { registerWaitForImportTool } from "./tools/wait-for-import.js";
import { registerTriggerReimportTool } from "./tools/trigger-reimport.js";
import { registerGetProjectTool } from "./tools/get-project.js";
import { registerSearchCodebaseTool } from "./tools/search-codebase.js";
import { registerSuggestEditLocationsTool } from "./tools/suggest-edit-locations.js";
import { registerGetFileTool } from "./tools/get-file.js";
import { registerGetFilesTool } from "./tools/get-files.js";
import { registerMoveSymbolsTool } from "./tools/move-symbols.js";
import { registerRenameSymbolTool } from "./tools/rename-symbol.js";
import { registerFindCallersTool } from "./tools/find-callers.js";
import { registerFindUsagesTool } from "./tools/find-usages.js";
import { registerGetDiffTool } from "./tools/get-diff.js";
import { registerGetWorkingDiffTool } from "./tools/get-working-diff.js";
import { registerGetProjectMapTool } from "./tools/get-project-map.js";
import { registerListProjectsTool } from "./tools/list-projects.js";
import { registerGetProjectInsightsTool } from "./tools/get-project-insights.js";
import { registerProjectContextResource } from "./resources/project-context.js";
import { registerCheckAuthStatusTool } from "./tools/check-auth-status.js";
import { registerStartAuthFlowTool } from "./tools/start-auth-flow.js";
import { registerWaitForAuthTool } from "./tools/wait-for-auth.js";
import { registerLogoutTool } from "./tools/logout.js";

async function runMcpServer() {
  const config = await loadConfig();
  const server = new McpServer({
    name: "codemap-mcp-server",
    version: "1.0.0",
  });

  registerPingTool(server, config);
  registerCheckAuthStatusTool(server, config);
  registerLogoutTool(server, config);
  registerStartAuthFlowTool(server, config);
  registerWaitForAuthTool(server, config);
  registerCheckGithubConnectionTool(server, config);
  registerGetGithubConnectUrlTool(server, config);
  registerDisconnectGithubTool(server, config);
  registerCheckGitlabConnectionTool(server, config);
  registerGetGitlabConnectUrlTool(server, config);
  registerDisconnectGitlabTool(server, config);
  registerOpenUrlTool(server);
  registerGetCurrentWorkspaceInfoTool(server);
  registerListGithubRepositoriesTool(server, config);
  registerSearchGithubRepositoriesTool(server, config);
  registerCreateProjectTool(server, config);
  registerCreateProjectFromGithubTool(server, config);
  registerCreateProjectFromGitlabTool(server, config);
  registerWaitForImportTool(server, config);
  registerTriggerReimportTool(server, config);
  registerGetProjectTool(server, config);
  registerSearchCodebaseTool(server, config);
  registerSuggestEditLocationsTool(server, config);
  registerGetFileTool(server, config);
  registerGetFilesTool(server, config);
  registerMoveSymbolsTool(server, config);
  registerRenameSymbolTool(server, config);
  registerFindCallersTool(server, config);
  registerFindUsagesTool(server, config);
  registerGetDiffTool(server, config);
  registerGetWorkingDiffTool(server);
  registerGetProjectMapTool(server, config);
  registerListProjectsTool(server, config);
  registerGetProjectInsightsTool(server, config);

  // Resources — automatically surfaced to Claude as session context
  registerProjectContextResource(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runLoginCommand() {
  const config = await loadConfig();
  const client = createCodeMapClient(config);
  const startResponse = await startMcpLogin(client);
  const openedBrowser = await tryOpenLoginBrowser(startResponse.authorizeUrl);

  if (openedBrowser) {
    console.log("Opened browser for CodeMap MCP login.");
  } else {
    console.log("Open this URL to continue CodeMap MCP login:");
    console.log(startResponse.authorizeUrl);
  }

  console.log("Waiting for authorization...");
  const result = await waitForLoginAuthorization(config, startResponse);

  console.log("CodeMap MCP login completed.");
  console.log(`API URL: ${result.apiUrl || config.apiUrl}`);
  if (result.user?.email) {
    console.log(`Email: ${result.user.email}`);
  }
  if (result.user?.name) {
    console.log(`Name: ${result.user.name}`);
  }
}

async function runLogoutCommand() {
  const config = await loadConfig();
  await clearGlobalAuthConfig(config);

  console.log("Cleared CodeMap MCP stored credentials from global config.");
  console.log(`API URL preserved: ${config.apiUrl}`);
}

async function runWhoAmICommand() {
  const config = await loadConfig();

  if (!config.apiToken) {
    console.log("Not authenticated.");
    console.log(`API URL: ${config.apiUrl}`);
    console.log("Run `codemap-mcp login` to authenticate.");
    return;
  }

  const me = await getMcpWhoAmI(createCodeMapClient(config));
  console.log("Authenticated with CodeMap.");
  console.log(`API URL: ${me.apiUrl}`);
  if (me.user.email) {
    console.log(`Email: ${me.user.email}`);
  }
  if (me.user.name) {
    console.log(`Name: ${me.user.name}`);
  }
  if (me.user.id) {
    console.log(`User ID: ${me.user.id}`);
  }
}

async function main() {
  const command = process.argv[2];

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
    default:
      await runMcpServer();
  }
}

main().catch((error: unknown) => {
  console.error(
    "CodeMap MCP server failed",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
