// Minimal terminal interface consumed by the TUI application.

import type { HarnessQuestionAnswer } from "../../../agent/runtime/events.js";
import type { Store } from "../../state/store-class.js";
import type { EventBus } from "@codemap-ai/core/agent";

export interface ChatTerminalLike {
  readonly store: Store;
  readonly bus: EventBus;
  resolvePlanReview(action: string): void;
  resolveAskQuestion(answer: HarnessQuestionAnswer): void;
  resolveToolApproval(decision: "approve" | "decline" | "always_allow_category"): void;
  handleSubmitWithContent(content: string, skipConfirmation?: boolean, images?: Array<{ data: string; mimeType: string; filename?: string }>): void;
  cancelTask(): string | null;
}
