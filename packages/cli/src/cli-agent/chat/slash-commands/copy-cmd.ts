import type { Command } from "./types.js";
import { copyToClipboard } from "../ui/pi-tui/clipboard.js";

export const copyCommand: Command = {
  name: "copy",
  description: "Copy last assistant response to clipboard",
  execute: (_args, ctx) => {
    const msgs = ctx.getMessages?.() ?? [];
    const last = [...msgs].reverse().find((m) => m.role === "assistant" && m.content?.trim());
    if (!last) {
      ctx.appendMessage({ role: "system", content: "Nothing to copy — no assistant response found." });
      return;
    }
    const ok = copyToClipboard(last.content);
    ctx.appendMessage({
      role: "system",
      content: ok
        ? `Copied to clipboard (${last.content.length.toLocaleString()} chars).`
        : "Copy failed — pbcopy/xclip/xsel not available.",
    });
  },
};
