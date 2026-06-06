import type { EventBus } from "../../events/event-bus.js";
import type { Message, Store } from "../../state/store.js";
import type { DebugLogger } from "../../../agent/utils/debug-logger.js";
import type { ChatTerminalOptions } from "../config/types.js";

export interface SubmitHandlerContext {
  store: Store;
  bus: EventBus;
  logger: DebugLogger | null;
  options: ChatTerminalOptions;

  appendMessage(msg: Message): number;
  updateLastAssistantMessage(content: string): void;
  refreshWorkspaceCommits(): Promise<void>;

  beginTask(controller: AbortController): number;
  finishTask(taskId: number): void;
  isActiveTask(taskId: number, controller: AbortController): boolean;

  getSessionResourceContext(signal?: AbortSignal): Promise<string | null>;
  getSessionProjectContext(): Promise<{
    conventions: string | null;
    rules: string | null;
  }>;
}
