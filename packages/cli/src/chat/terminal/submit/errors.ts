import type { Store } from "../../state/store-class.js";
import type { GatewayModel } from "@codemap-ai/core/agent";
import { isStrongModel } from "../lifecycle/workspace-helpers.js";

export function handleSubmitError(
  err: unknown,
  store: Store,
  appendMessage: (msg: { role: "system"; content: string }) => number,
  imageFiles?: Array<{ data: string; mimeType: string; filename?: string }>,
): void {
  store.dispatch({ task: { phase: "idle", toolsCalled: 0 } });
  const errMsg = err instanceof Error ? err.message : String(err);
  const isContextFull =
    errMsg.includes("context window") ||
    errMsg.includes("context length") ||
    errMsg.includes("maximum context") ||
    errMsg.includes("token limit") ||
    errMsg.includes("too long") ||
    errMsg.includes("exceeds") ||
    errMsg.includes("input is too long") ||
    errMsg.includes("prompt is too long");
  const isModelBroken =
    errMsg.includes("zero-length") ||
    errMsg.includes("empty document") ||
    errMsg.includes("429");
  const isImageUnsupported =
    errMsg.includes("image input") || errMsg.includes("support image");
  const cs = store.getState().config;

  if (isContextFull) {
    appendMessage({
      role: "system",
      content:
        "Context window full. Start a new session with /new to free context.",
    });
  } else if (isModelBroken && cs.availableModels.length > 1) {
    const strong = cs.availableModels.filter(
      (m: GatewayModel) => m.id !== cs.model && isStrongModel(m.id),
    );
    const newModel =
      strong[0] ??
      cs.availableModels.find((m: GatewayModel) => m.id !== cs.model) ??
      null;
    if (newModel) {
      store.dispatch({ config: { ...cs, model: newModel.id } });
      appendMessage({
        role: "system",
        content: `Model "${cs.model}" failed. Auto-switched to "${newModel}". Resend your message to retry.`,
      });
    } else {
      appendMessage({
        role: "system",
        content: `Model "${cs.model}" failed and no alternative found.`,
      });
    }
  } else if (isImageUnsupported) {
    appendMessage({
      role: "system",
      content: imageFiles?.length
        ? `Model "${cs.model}" does not support image input. Switch to a vision-capable model with /model, or resend without images.`
        : `Model "${cs.model}" does not support image input.`,
    });
  } else {
    appendMessage({ role: "system", content: `Error: ${errMsg}` });
  }
}
