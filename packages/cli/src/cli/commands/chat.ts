import type { GatewayCommandContext } from ".././command-context.js";
import { CodeMapMcpToolClient } from "../../agent/tools/mcp/mcp-tool-client.js";
import type { ChatUiMode } from "../../agent/runtime/cli-runtime.js";
import { NineRouterProvider } from "@codemap-ai/core/agent";
import type { GatewayConfig, GatewayModel } from "@codemap-ai/core/agent";
import { printGatewayHint } from "./doctor.js";
import { loadConfig } from "@codemap-ai/core/config.js";
import { installStderrInterceptor } from "../../tui/renderer/stderr-interceptor.js";
import { resetHarnessSingleton } from "../../agent/runtime/harness-runtime.js";

export async function runChat(ctx: GatewayCommandContext): Promise<void> {
  const provider = new NineRouterProvider(
    ctx.config.baseUrl,
    ctx.config.apiKey,
  );
  const availableModels = await loadGatewayModels(ctx.config, provider);
  const requestedModel = ctx.flags.model ?? ctx.config.defaultModel;
  const model = requestedModel;
  const uiMode = parseUiMode(ctx.flags.ui);
  const mcpConfig = await loadConfig();
  const toolClient = new CodeMapMcpToolClient();

  await toolClient.connectExtras(mcpConfig.globalMcpServers);

  const cleanupInterceptor = installStderrInterceptor();

  // Intercept process.exit so MCP child processes are always cleaned up before
  // the process terminates — covers Ctrl+C (pre-TUI), /exit command, and SIGTERM.
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
    const { ChatTerminal } =
      await import("../../chat/terminal/chat-terminal.js");
    const terminal = new ChatTerminal({
      provider,
      gatewayConfig: ctx.config,
      model,
      toolClient,
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
): Promise<GatewayModel[]> {
  try {
    return await provider.listModelDetails();
  } catch (error) {
    await printGatewayHint(config);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Gateway model list unavailable: ${message}`);
    console.error("Using configured default model instead.");
    return [];
  }
}
