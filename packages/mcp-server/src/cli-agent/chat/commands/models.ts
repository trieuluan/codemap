import { filterModelsByMode } from "./route-policy.js";
import type { Command } from "./index.js";

export const modelsCommand: Command = {
  name: "models",
  description: "List models (filtered by mode policy)",
  execute: (_args, ctx) => {
    if (ctx.availableModels && ctx.availableModels.length > 0) {
      const { models: visible, filtered } = filterModelsByMode(
        ctx.availableModels,
        ctx.currentMode,
      );
      const list = visible
        .map((m) => `- ${m}${m === ctx.currentModel ? " (active)" : ""}`)
        .join("\n");
      const parts = [
        `Models (${visible.length}/${ctx.availableModels.length}):`,
      ];
      if (filtered.length > 0) {
        parts.push(
          `(${filtered.length} hidden by ${ctx.currentMode} policy)`,
        );
      }
      parts.push(list);
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: parts.join("\n") },
      ]);
    } else {
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content:
            "No gateway models available. Using configured profile models.",
        },
      ]);
    }
  },
};
