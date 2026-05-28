import type { Command } from "./types.js";

export const historyCommand: Command = {
  name: "history",
  description: "Show conversation stats",
  execute: (_args, ctx) => {
    const msgs = ctx.getMessages();
    const turns = msgs.filter((m) => m.role === "user").length;
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `Conversation: ${turns} user turns, ${msgs.length} total messages`,
      },
    ]);
  },
};
