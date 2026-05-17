import { getWorkspaceStatusLines } from "../../commands/status.js";
import type { Command } from "./types.js";

export const statusCommand: Command = {
  name: "status",
  description: "Show model, session, and workspace status",
  execute: async (_args, ctx) => {
    const workspaceStatus = await getWorkspaceStatusLines();
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
          "",
          ...workspaceStatus,
        ].join("\n"),
      },
    ]);
  },
};
