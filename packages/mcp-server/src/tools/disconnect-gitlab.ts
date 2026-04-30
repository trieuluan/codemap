import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import {
  gitlabIntegrationProvider,
  registerIntegrationDisconnectTool,
} from "./integration-tools.js";

export function registerDisconnectGitlabTool(
  server: McpServer,
  config: McpServerConfig,
) {
  registerIntegrationDisconnectTool(server, config, gitlabIntegrationProvider);
}
