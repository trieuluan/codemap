import type { ChatUiMode } from "../../../agent/runtime/cli-runtime.js";
import type { CodeMapMcpToolClient } from "@codemap-ai/runtime-node";
import type { NineRouterProvider } from "@codemap-ai/core/agent";
import type { GatewayConfig, GatewayModel } from "@codemap-ai/core/agent";
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
