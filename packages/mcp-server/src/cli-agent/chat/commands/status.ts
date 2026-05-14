import type { Command } from "./types.js";

export const statusCommand: Command = {
  name: "status",
  description: "Show current model and session info",
  execute: (_args, ctx) => {
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `Model:   ${ctx.currentModel}`,
          `History: ${ctx.history.length} messages`,
          ctx.availableModels?.length
            ? `Gateway: ${ctx.availableModels.length} models available`
            : "Gateway: not available",
        ].join("\n"),
      },
    ]);
  },
};
