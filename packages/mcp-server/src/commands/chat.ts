import type { GatewayCommandContext } from "../cli-agent/command-context.js";
import { CodeMapMcpToolClient } from "../cli-agent/chat/mcp-tools/mcp-tool-client.js";
import { selectChatProfile } from "../cli-agent/chat/slash-commands/profiles.js";
import type { ChatUiMode } from "../cli-agent/chat/harness/cli-runtime.js";
import { NineRouterProvider } from "../cli-agent/core/provider.js";
import type { GatewayConfig } from "../cli-agent/types.js";
import { printGatewayHint } from "./gateway-hint.js";
import { loadConfig } from "../config.js";
import { installStderrInterceptor } from "../cli-agent/chat/ui/stderr-interceptor.js";
import { resetHarnessSingleton } from "../cli-agent/chat/harness/harness-runtime.js";

export async function runChat(ctx: GatewayCommandContext): Promise<void> {
  const provider = new NineRouterProvider(
    ctx.config.baseUrl,
    ctx.config.apiKey,
  );
  const availableModels = await loadGatewayModels(ctx.config, provider);
  const profile = selectChatProfile(ctx.config, ctx.flags.model);
  const uiMode = parseUiMode(ctx.flags.ui);
  const toolClient = new CodeMapMcpToolClient();

  await toolClient.connectExtras();

  const cleanupInterceptor = installStderrInterceptor();

  // Intercept process.exit so MCP child processes are always cleaned up before
  // the process terminates — covers Ctrl+C (pre-TUI), /exit command, and SIGTERM.
  // Without this, stdio MCP server children spawned by McpServerConnection and
  // mastracode's MCPClient become orphans and accumulate across sessions.
  const originalProcessExit = process.exit.bind(process) as typeof process.exit;
  let childCleanupDone = false;
  const cleanupChildren = async () => {
    if (childCleanupDone) return;
    childCleanupDone = true;
    await toolClient.close().catch(() => {});
    await resetHarnessSingleton().catch(() => {});
  };
  (process as NodeJS.Process).exit = ((code?: number | string) => {
    cleanupChildren().finally(() => originalProcessExit(code as number));
  }) as typeof process.exit;

  try {
    const mcpConfig = await loadConfig();
    const { ChatTerminal } = await import("../cli-agent/chat/ui/chat-terminal.js");
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
    process.exit = originalProcessExit;
    cleanupInterceptor();
    await cleanupChildren();
  }
}

function parseUiMode(value: string | undefined): ChatUiMode | undefined {
  if (value === "tui") {
    return value;
  }
  return undefined;
}

async function loadGatewayModels(
  config: GatewayConfig,
  provider: NineRouterProvider,
): Promise<string[]> {
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
