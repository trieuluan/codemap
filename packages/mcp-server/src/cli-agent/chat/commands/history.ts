import type { Command } from "./index.js";

export const historyCommand: Command = {
  name: "history",
  description: "Show conversation stats",
  execute: (_args, ctx) => {
    const turns = ctx.history.filter((m) => m.role === "user").length;
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: `Conversation: ${turns} user turns, ${ctx.history.length} total messages`,
      },
    ]);
  },
};
