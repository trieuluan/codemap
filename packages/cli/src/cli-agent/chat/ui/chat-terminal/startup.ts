import { loadOrSynthesizeAll } from "../../../core/convention-synthesizer.js";
import { warmupFileSearch } from "../../../core/file-search.js";
import { warmupHarness } from "../../harness/harness-runtime.js";
import type { EventBus } from "../event-bus.js";
import type { Store } from "../store.js";
import type { ChatTerminal } from "./types.js";
import type { ChatTerminalOptions } from "./types.js";

interface StartChatTerminalRuntimeOptions {
  terminal: ChatTerminal;
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
  if (!options.apiToken && options.mcpConfig) {
    const { showLoginScreen } = await import("../pi-tui/login-screen.js");
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

  const { startPiTuiApp } = await import("../pi-tui-app.js");
  await startPiTuiApp(terminal);
}
