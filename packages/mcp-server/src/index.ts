#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { clearGlobalAuthConfig, loadConfig } from "./config.js";
import {
  getMcpWhoAmI,
  startMcpLogin,
  tryOpenLoginBrowser,
  waitForLoginAuthorization,
} from "./lib/mcp-auth.js";
import { registerPingTool } from "./tools/ping.js";
import { registerGetFileOutlineTool } from "./tools/get-file-outline.js";
import { registerCheckGithubConnectionTool } from "./tools/check-github-connection.js";
import { registerGetGithubConnectUrlTool } from "./tools/get-github-connect-url.js";
import { registerDisconnectGithubTool } from "./tools/disconnect-github.js";
import { registerOpenUrlTool } from "./tools/open-url.js";
import { registerGetCurrentWorkspaceInfoTool } from "./tools/get-current-workspace-info.js";
import {
  registerListGithubRepositoriesTool,
  registerSearchGithubRepositoriesTool,
} from "./tools/list-github-repositories.js";
import { registerCreateProjectFromWorkspaceTool } from "./tools/create-project-from-workspace.js";
import { registerCreateProjectFromGithubTool } from "./tools/create-project-from-github.js";
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
  registerGetFileOutlineTool(server, config);
  registerCheckGithubConnectionTool(server, config);
  registerGetGithubConnectUrlTool(server, config);
  registerDisconnectGithubTool(server, config);
  registerOpenUrlTool(server);
  registerGetCurrentWorkspaceInfoTool(server);
  registerListGithubRepositoriesTool(server, config);
  registerSearchGithubRepositoriesTool(server, config);
  registerCreateProjectFromWorkspaceTool(server, config);
  registerCreateProjectFromGithubTool(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runLoginCommand() {
  const config = await loadConfig();
  const startResponse = await startMcpLogin(config);
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

  const me = await getMcpWhoAmI(config);
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
