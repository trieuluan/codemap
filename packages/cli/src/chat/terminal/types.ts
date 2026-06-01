import type { ChatUiMode } from "../../agent/runtime/cli-runtime.js";
import type { CodeMapMcpToolClient } from "../../agent/tools/mcp/mcp-tool-client.js";
import type { NineRouterProvider } from "../../agent/core/provider.js";
import type { GatewayModel } from "../../agent/types.js";

export interface ChatTerminalOptions {
  provider: NineRouterProvider;
  model: string;
  toolClient: CodeMapMcpToolClient;
  availableModels?: GatewayModel[];
  apiToken?: string;
  mcpConfig?: import("@codemap/core/config.js").McpServerConfig;
  uiMode?: ChatUiMode;
}

export interface ChatTerminal {
  start(): Promise<void>;
}
