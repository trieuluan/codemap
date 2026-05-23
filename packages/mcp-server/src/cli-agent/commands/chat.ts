import type { GatewayCommandContext } from "../command-context.js";
import { CodeMapMcpToolClient } from "../chat/mcp/mcp-tool-client.js";
import { selectChatProfile } from "../chat/commands/profiles.js";
import type { ChatUiMode } from "../chat/runtime/cli-runtime.js";
import { NineRouterProvider } from "../provider.js";
import type { GatewayConfig } from "../types.js";
import { printGatewayHint } from "./gateway-hint.js";
import { loadConfig } from "../../config.js";

export async function runChat(ctx: GatewayCommandContext): Promise<void> {
  const provider = new NineRouterProvider(ctx.config.baseUrl, ctx.config.apiKey);
  const availableModels = await loadGatewayModels(ctx.config, provider);
  const profile = selectChatProfile(ctx.config, ctx.flags.model);
  const uiMode = parseUiMode(ctx.flags.ui);
  const toolClient = new CodeMapMcpToolClient();

  await toolClient.connectExtras();

  try {
    const mcpConfig = await loadConfig();
    const { ChatTerminal } = await import("../chat/ui/chat-terminal.js");
    const terminal = new ChatTerminal({
      provider,
      model: profile.model,
      toolClient,
      profileId: profile.id,
      profiles: ctx.config.profiles,
      availableModels,
      apiToken: mcpConfig.apiToken ?? undefined,
      mcpConfig,
      uiMode,
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

function parseUiMode(value: string | undefined): ChatUiMode | undefined {
  if (value === "tui") {
    return value;
  }
  return undefined;
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
