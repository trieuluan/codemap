import { getWorkspaceStatusLines } from "../../cli/commands/status.js";
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
          `History: ${ctx.getMessages().length} messages`,
          ctx.availableModels?.length
            ? `Gateway: ${ctx.availableModels.length} models available`
            : "Gateway: not available",
          ctx.getSessionTokens() > 0
            ? `Tokens:  ${ctx.getSessionTokens().toLocaleString()} total (thread)`
            : "",
          "",
          ...workspaceStatus,
        ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n"),
      },
    ]);
  },
};
