import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import {
  githubIntegrationProvider,
  registerIntegrationDisconnectTool,
} from "./integration-tools.js";

export function registerDisconnectGithubTool(
  server: McpServer,
  config: McpServerConfig,
) {
  registerIntegrationDisconnectTool(server, config, githubIntegrationProvider);
}
