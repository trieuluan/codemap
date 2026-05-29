import type { Command } from "./types.js";

export const modelsCommand: Command = {
  name: "models",
  description: "Switch the active model",
  execute: (_args, ctx) => {
    if (!ctx.availableModels || ctx.availableModels.length === 0) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: "No gateway models available." },
      ]);
    }
    // Actual model picker is handled inline by pi-tui-app (intercepts /models Enter)
  },
};
