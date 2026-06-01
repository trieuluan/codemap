import type { ChatUiMode } from "../../harness/cli-runtime.js";
import type { CodeMapMcpToolClient } from "../../mcp-tools/mcp-tool-client.js";
import type { NineRouterProvider } from "../../../core/provider.js";
import type { GatewayModel } from "../../../types.js";

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
