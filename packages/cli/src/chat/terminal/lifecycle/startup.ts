import { loadOrSynthesizeAll } from "../../../agent/core/convention-synthesizer.js";
import { warmupFileSearch } from "../../../agent/core/file-search.js";
import { warmupHarness } from "../../../agent/runtime/harness-runtime.js";
import type { EventBus } from "../../events/event-bus.js";
import type { Store } from "../../state/store.js";
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
    const { showLoginScreen } = await import("../../../tui/login-screen.js");
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
    onDebug: undefined,
    extraServerConfigs: options.toolClient.getExtraServerConfigs(),
    mastraTools,
  }).catch(() => {});

  store.dispatch({ synthRunning: true });
  bus.scheduleRefresh();
  loadOrSynthesizeAll(options.provider, store.getState().config.model)
    .catch(() => {})
    .finally(() => {
      store.dispatch({ synthRunning: false });
      bus.scheduleRefresh();
    });

  const { startPiTuiApp } = await import("../../../tui/app.js");
  await startPiTuiApp(terminal);
}
