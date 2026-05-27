import type { Command } from "./types.js";

export const diffCommand: Command = {
  name: "diff",
  description: "Show working diff",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    try {
      const result = await ctx.toolClient.callTool("diff", {
        mode: "working",
        include_patch: false,
        include_untracked: true,
      });
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: result.content },
      ]);
    } catch (err) {
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${err}` },
      ]);
    }
    ctx.setBusy(false);
  },
};
