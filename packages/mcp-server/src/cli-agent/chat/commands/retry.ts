import type { Command } from "./index.js";

export const retryCommand: Command = {
  name: "retry",
  description: "Retry last message with current model",
  execute: (_args, ctx) => {
    if (!ctx.lastUserText) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: "No previous message to retry." },
      ]);
      return;
    }
    // Remove the last user message entry and system error from messages
    ctx.setMessages((prev) => {
      const msgs = [...prev];
      // Remove trailing system error about model failure
      while (msgs.length > 0 && msgs[msgs.length - 1].role === "system") {
        msgs.pop();
      }
      // Remove trailing user message
      while (msgs.length > 0 && msgs[msgs.length - 1].role === "user") {
        msgs.pop();
      }
      return msgs;
    });
    // Re-submit the message
    ctx.resend();
  },
};
