// Minimal interface for ChatTerminal consumed by pi-tui-app.
// Extracted here to break the circular dependency between chat-terminal.ts and pi-tui-app.ts.

import type { HarnessQuestionAnswer } from "../harness/events.js";
import type { Store } from "./store.js";
import type { EventBus } from "./event-bus.js";

export interface ChatTerminalLike {
  readonly store: Store;
  readonly bus: EventBus;
  resolvePlanReview(action: string): void;
  resolveAskQuestion(answer: HarnessQuestionAnswer): void;
  handleSubmitWithContent(content: string, skipConfirmation?: boolean, images?: Array<{ data: string; mimeType: string }>): void;
  cancelTask(): string | null;
}
