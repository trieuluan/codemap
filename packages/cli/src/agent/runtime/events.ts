// Re-exported from @codemap-ai/core — kept here for backward compatibility.
// CLI wraps bridgeCommonEvent to inject buildToolPreview from tool-approval-policy.
import { buildToolPreview } from "./config/tool-approval-policy.js";
import {
  bridgeCommonEvent as coreBridgeCommonEvent,
} from "@codemap-ai/runtime-node";
import type {
  BridgeCallbacks,
  HarnessEvent,
} from "@codemap-ai/runtime-node";

export type {
  HarnessThread,
  HarnessMessage,
  HarnessMessageContent,
  AskQuestionOption,
  HarnessRequestContext,
  HarnessQuestionAnswer,
  HarnessQuestionSelectionMode,
  HarnessEvent,
  HarnessDisplayState,
  MastraHarness,
  BridgeCallbacks,
} from "@codemap-ai/runtime-node";
export { summarizeHarnessEvent } from "@codemap-ai/runtime-node";

/**
 * CLI-aware wrapper: injects buildToolPreview into BridgeCallbacks before
 * delegating to the shared core bridgeCommonEvent.
 */
export function bridgeCommonEvent(
  event: HarnessEvent,
  cb: BridgeCallbacks,
): void {
  coreBridgeCommonEvent(event, {
    ...cb,
    toolPreviewBuilder: cb.toolPreviewBuilder ?? ((name, args) => buildToolPreview(name, args)),
  });
}
