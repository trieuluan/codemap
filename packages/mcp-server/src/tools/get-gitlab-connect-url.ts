import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import {
  gitlabIntegrationProvider,
  registerIntegrationConnectUrlTool,
} from "./integration-tools.js";

export function registerGetGitlabConnectUrlTool(
  server: McpServer,
  config: McpServerConfig,
) {
  registerIntegrationConnectUrlTool(server, config, gitlabIntegrationProvider);
}
