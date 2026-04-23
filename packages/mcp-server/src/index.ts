#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { registerPingTool } from "./tools/ping.js";
import { registerGetFileOutlineTool } from "./tools/get-file-outline.js";
import { registerCheckGithubConnectionTool } from "./tools/check-github-connection.js";
import { registerGetGithubConnectUrlTool } from "./tools/get-github-connect-url.js";
import { registerOpenUrlTool } from "./tools/open-url.js";
import { registerGetCurrentWorkspaceInfoTool } from "./tools/get-current-workspace-info.js";
import {
  registerListGithubRepositoriesTool,
  registerSearchGithubRepositoriesTool,
} from "./tools/list-github-repositories.js";
import { registerCreateProjectFromWorkspaceTool } from "./tools/create-project-from-workspace.js";
import { registerCreateProjectFromGithubTool } from "./tools/create-project-from-github.js";

async function main() {
  const config = loadConfig();
  const server = new McpServer({
    name: "codemap-mcp-server",
    version: "1.0.0",
  });

  registerPingTool(server, config);
  registerGetFileOutlineTool(server, config);
  registerCheckGithubConnectionTool(server, config);
  registerGetGithubConnectUrlTool(server, config);
  registerOpenUrlTool(server);
  registerGetCurrentWorkspaceInfoTool(server);
  registerListGithubRepositoriesTool(server, config);
  registerSearchGithubRepositoriesTool(server, config);
  registerCreateProjectFromWorkspaceTool(server, config);
  registerCreateProjectFromGithubTool(server, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("CodeMap MCP server failed to start", error);
  process.exitCode = 1;
});
