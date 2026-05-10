import type { Command } from "./index.js";

export const clearCommand: Command = {
  name: "clear",
  description: "Clear chat history",
  execute: (_args, ctx) => {
    ctx.setMessages([]);
    ctx.setHistory([]);
    ctx.setInputHistory([]);
  },
};
