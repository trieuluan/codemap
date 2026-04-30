import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import {
  githubIntegrationProvider,
  registerIntegrationConnectUrlTool,
} from "./integration-tools.js";

export function registerGetGithubConnectUrlTool(
  server: McpServer,
  config: McpServerConfig,
) {
  registerIntegrationConnectUrlTool(server, config, githubIntegrationProvider);
}
