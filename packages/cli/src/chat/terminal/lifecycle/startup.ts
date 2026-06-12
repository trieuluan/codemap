import { warmupFileSearch } from "../../../agent/utils/file-search.js";
import {
  warmupHarness,
  autoResumeLatestThread,
  listMastraThreadMessages,
  getMastraDisplayState,
  maybeCleanupMastraDb,
} from "@codemap-ai/runtime-node";
import type { EventBus } from "@codemap-ai/core/agent";
import type { Store } from "../../state/store-class.js";
import type { ChatTerminalLike } from "../ui/types.js";
import type { ChatTerminalOptions } from "../config/types.js";
import { loadTerminalTheme } from "../../../tui/theme-loader.js";

interface StartChatTerminalRuntimeOptions {
  terminal: ChatTerminalLike;
  store: Store;
  bus: EventBus;
  options: ChatTerminalOptions;
  refreshWorkspaceCommits: () => Promise<void>;
}

export async function startChatTerminalRuntime({
  terminal,
  store,
  bus,
  options,
  refreshWorkspaceCommits,
}: StartChatTerminalRuntimeOptions): Promise<void> {
  await loadTerminalTheme();

  if (!options.apiToken && options.mcpConfig) {
    const { showLoginScreen } = await import("../../../tui/renderer/login-screen.js");
    const result = await showLoginScreen(options.mcpConfig);
    if (result === "exit") return;
  }

  warmupFileSearch()
    .catch(() => {})
    .finally(() => bus.scheduleRefresh());

  await refreshWorkspaceCommits();

  const startupModel = store.getState().config.model;
  const mastraTools = await options.toolClient
    .getMastraTools()
    .catch(() => undefined);

  warmupHarness({
    toolClient: options.toolClient,
    baseUrl: options.provider.baseUrl,
    apiKey: options.provider.apiKey,
    modelId: startupModel,
    availableModels: store.getState().config.availableModels.map((m) => m.id),
    providerId: options.gatewayConfig.provider,
    modeDefaults: options.gatewayConfig.modeDefaults,
    onDebug: undefined,
    extraServerConfigs: options.toolClient.getExtraServerConfigs(),
    mastraTools,
  })
    .then(async () => {
      const resumedThreadId = await autoResumeLatestThread();
      const { restorePendingPrompts } = await import("../ui/plan-review.js");
      restorePendingPrompts(
        { bus, store },
        resumedThreadId ? getMastraDisplayState() : null,
      );
      if (resumedThreadId) {
        const { mapHarnessMessagesToUI } = await import(
          "../../../chat/slash-commands/sessions.js"
        );
        const messages = await listMastraThreadMessages(resumedThreadId, 100);
        store.dispatch({
          messages: mapHarnessMessagesToUI(messages),
          sessionTokens: 0,
        });
        bus.scheduleRefresh();
      }
    })
    .catch(() => {});

  maybeCleanupMastraDb();

  const { startPiTuiApp } = await import("../../../tui/app.js");
  await startPiTuiApp(terminal);
}
