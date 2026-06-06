import type { ChatUiMode } from "../../../agent/runtime/cli-runtime.js";
import type { CodeMapMcpToolClient } from "../../../agent/tools/mcp/mcp-tool-client.js";
import type { NineRouterProvider } from "../../../agent/loop/provider.js";
import type { GatewayConfig, GatewayModel } from "../../../agent/types.js";
import type { McpServerConfig } from "@codemap-ai/core/config.js";

export interface ChatTerminalOptions {
  provider: NineRouterProvider;
  gatewayConfig: GatewayConfig;
  model: string;
  toolClient: CodeMapMcpToolClient;
  availableModels?: GatewayModel[];
  apiToken?: string;
  mcpConfig?: McpServerConfig;
  uiMode?: ChatUiMode;
}

export interface ChatTerminal {
  start(): Promise<void>;
}
