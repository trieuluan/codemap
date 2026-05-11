import { getModeDisplay } from "./route-policy.js";
import type { Command } from "./index.js";

export const statusCommand: Command = {
  name: "status",
  description: "Show current model, mode, policy",
  execute: (_args, ctx) => {
    const modeInfo = getModeDisplay(ctx.currentMode);
    ctx.setMessages((prev) => [
      ...prev,
      {
        role: "system",
        content: [
          `Model:   ${ctx.currentModel}`,
          `Mode:    ${ctx.currentMode} [${modeInfo.label}] — ${modeInfo.description}`,
          `Profile: ${ctx.profileId}`,
          `History: ${ctx.history.length} messages`,
          ctx.availableModels?.length
            ? `Gateway: ${ctx.availableModels.length} models`
            : "Gateway: not available",
        ].join("\n"),
      },
    ]);
  },
};
