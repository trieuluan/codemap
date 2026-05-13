import { parseModeFlag } from "../args.js";
import type { GatewayCommandContext } from "../command-context.js";
import { CodeMapMcpToolClient } from "../chat/mcp/mcp-tool-client.js";
import { selectChatProfile } from "../chat/commands/profiles.js";
import { NineRouterProvider } from "../provider.js";
import type { GatewayConfig } from "../types.js";
import { printGatewayHint } from "./gateway-hint.js";
import { loadConfig } from "../../config.js";

export async function runChat(ctx: GatewayCommandContext): Promise<void> {
  const mode = parseModeFlag(ctx.flags.mode);
  const provider = new NineRouterProvider(ctx.config.baseUrl, ctx.config.apiKey);
  const availableModels = await loadGatewayModels(ctx.config, provider);
  const profile = selectChatProfile(ctx.config, ctx.flags.model, mode);
  const toolClient = new CodeMapMcpToolClient();

  // Connect external MCP servers from .codemap/mcp.json (best-effort)
  await toolClient.connectExtras();

  try {
    const mcpConfig = await loadConfig();
    const { ChatTerminal } = await import("../chat/ui/chat-terminal.js");
    const terminal = new ChatTerminal({
      provider,
      model: profile.model,
      toolClient,
      profileId: profile.id,
      mode: mode ?? ctx.config.mode,
      availableModels,
      apiToken: mcpConfig.apiToken ?? undefined,
      mcpConfig,
    });
    await terminal.start();
  } catch (err) {
    if (err instanceof Error && err.message !== "App exited") {
      throw err;
    }
  } finally {
    await toolClient.close();
  }
}

async function loadGatewayModels(config: GatewayConfig, provider: NineRouterProvider): Promise<string[]> {
  try {
    return await provider.listModels();
  } catch (error) {
    printGatewayHint(config);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Gateway model list unavailable: ${message}`);
    console.error("Using configured model profiles instead.");
    return [];
  }
}
