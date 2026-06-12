import type { EventBus } from "@codemap-ai/core/agent";
import type { Message } from "../../state/types.js";
import type { Store } from "../../state/store-class.js";
import type { DebugLogger } from "@codemap-ai/runtime-node/utils";
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
