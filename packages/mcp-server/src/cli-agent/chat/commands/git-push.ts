import type { Command } from "./types.js";

export const gitPushCommand: Command = {
  name: "push",
  description: "Push current branch to remote (sets upstream if needed)",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    try {
      // Get current branch
      const branchResult = await ctx.toolClient.callTool("bash", {
        command: "git rev-parse --abbrev-ref HEAD",
      });
      const branch = branchResult.content.trim();

      if (!branch || branch === "HEAD") {
        append("Not on a branch — cannot push.");
        ctx.setBusy(false);
        return;
      }

      // Try normal push first, fall back to setting upstream
      const pushResult = await ctx.toolClient.callTool("bash", {
        command: `git push 2>&1 || git push -u origin ${branch} 2>&1`,
      });

      append(pushResult.content || `Pushed \`${branch}\`.`);
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    ctx.setBusy(false);
  },
};
