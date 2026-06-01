// Minimal interface for ChatTerminal consumed by pi-tui-app.
// Extracted here to break the circular dependency between chat-terminal.ts and pi-tui-app.ts.

import type { HarnessQuestionAnswer } from "../../agent/runtime/events.js";
import type { Store } from "../state/store.js";
import type { EventBus } from "../events/event-bus.js";

export interface ChatTerminalLike {
  readonly store: Store;
  readonly bus: EventBus;
  resolvePlanReview(action: string): void;
  resolveAskQuestion(answer: HarnessQuestionAnswer): void;
  handleSubmitWithContent(content: string, skipConfirmation?: boolean, images?: Array<{ data: string; mimeType: string }>): void;
  cancelTask(): string | null;
}
