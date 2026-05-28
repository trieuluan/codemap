import type { Command } from "./types.js";

export const modelsCommand: Command = {
  name: "models",
  description: "List models available from the gateway",
  execute: (_args, ctx) => {
    if (ctx.availableModels && ctx.availableModels.length > 0) {
      const list = ctx.availableModels
        .map((m) => `- ${m}${m === ctx.currentModel ? " (active)" : ""}`)
        .join("\n");
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `Models (${ctx.availableModels!.length}):\n${list}` },
      ]);
    } else {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: "No gateway models available. Using configured profile models." },
      ]);
    }
  },
};
