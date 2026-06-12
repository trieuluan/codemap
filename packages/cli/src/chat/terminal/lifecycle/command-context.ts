import type { DebugLogger } from "@codemap-ai/runtime-node/utils";
import { createDebugLogger } from "@codemap-ai/runtime-node/utils";
import {
  resetHarnessSingleton,
  warmupHarness,
  getMastraThreadId,
  switchMastraThread,
} from "@codemap-ai/runtime-node";
import { getCommandList } from "../../slash-commands/index.js";
import type { CommandContext } from "../../slash-commands/types.js";
import type { EventBus } from "@codemap-ai/core/agent";
import type { Message } from "../../state/types.js";
import type { Store } from "../../state/store-class.js";
import type { ChatTerminalOptions } from "../config/types.js";

interface BuildChatCommandContextOptions {
  store: Store;
  bus: EventBus;
  options: ChatTerminalOptions;
  getLogger: () => DebugLogger | null;
  setLogger: (logger: DebugLogger | null) => void;
  handleSubmit: (text: string) => Promise<void>;
  startNewSession: () => void;
  loadMastraThreadMessages: (threadId: string) => Promise<void>;
  refreshWorkspaceCommits: () => Promise<void>;
}

export function buildChatCommandContext({
  store,
  bus,
  options,
  getLogger,
  setLogger,
  handleSubmit,
  startNewSession,
  loadMastraThreadMessages,
  refreshWorkspaceCommits,
}: BuildChatCommandContextOptions): CommandContext {
  const s = store.getState();
  return {
    currentModel: s.config.model,
    provider: options.provider,
    availableModels: s.config.availableModels.map((m) => m.id),
    toolClient: options.toolClient,
    getMessages: () => store.getState().messages as Message[],
    appendMessage: (msg) => {
      store.dispatch((prev) => ({
        messages: [
          ...prev.messages,
          { timestamp: Date.now(), ...msg } as Message,
        ],
      }));
      bus.scheduleRefresh();
    },
    setMessages: (updater) => {
      if (typeof updater === "function") {
        store.dispatch((prev) => ({ messages: updater(prev.messages) }));
      } else {
        store.dispatch({ messages: updater });
      }
    },
    setInputHistory: (updater) => {
      if (typeof updater === "function") {
        store.dispatch((prev) => ({
          input: { ...prev.input, history: updater(prev.input.history) },
        }));
      } else {
        store.dispatch((prev) => ({
          input: { ...prev.input, history: updater },
        }));
      }
    },
    setCurrentModel: (m) => {
      store.dispatch((prev) => ({
        config: { ...prev.config, model: m },
      }));
    },
    setBusy: (b) => {
      store.dispatch((prev) => ({ input: { ...prev.input, busy: b } }));
    },
    debug: s.debug,
    setDebug: (d) => {
      store.dispatch((prev) => ({
        debug: d,
        config: { ...prev.config, debug: d },
      }));
      if (d && !getLogger()) setLogger(createDebugLogger());
      if (!d) setLogger(null);
    },
    debugLogFile: getLogger()?.logFile ?? null,
    lastUserText: s.input.lastUserText,
    persistSession: () => {
      /* no-op */
    },
    getSessionTokens: () => store.getState().sessionTokens,
    resend: () => {
      const cs = store.getState();
      if (cs.input.lastUserText && !cs.input.busy) handleSubmit(cs.input.lastUserText);
    },
    exit: () => {
      process.stdout.write("\x1b[?1000l\x1b[?1006l");
      process.exit(0);
    },
    newSession: startNewSession,
    getMastraThreadId: () => getMastraThreadId(),
    switchMastraThread: (threadId) => switchMastraThread(threadId),
    loadMastraThreadMessages,
    reinitHarness: async () => {
      await resetHarnessSingleton();
      await options.toolClient.reconnect().catch(() => {});
      await warmupHarness({
        toolClient: options.toolClient,
        baseUrl: options.provider.baseUrl,
        apiKey: options.provider.apiKey,
        modelId: store.getState().config.model,
        availableModels: store
          .getState()
          .config.availableModels.map((m) => m.id),
        providerId: options.gatewayConfig.provider,
        modeDefaults: options.gatewayConfig.modeDefaults,
        onDebug: undefined,
        extraServerConfigs: options.toolClient.getExtraServerConfigs(),
      });
    },
    startSubprocess: (command) => {
      store.dispatch({
        subprocess: { active: true, command, logLines: [] },
      });
    },
    logSubprocess: (line) => {
      store.dispatch((prev) => ({
        subprocess: {
          ...prev.subprocess,
          logLines: [...prev.subprocess.logLines, line],
        },
      }));
    },
    endSubprocess: () => {
      store.dispatch({
        subprocess: { active: false, command: "", logLines: [] },
      });
    },
    refreshWorkspaceCommits,
    getCommandList,
  };
}
