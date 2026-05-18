import type { Command } from "./types.js";

export const gitPushCommand: Command = {
  name: "push",
  description: "Push current branch to remote (sets upstream if needed)",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    ctx.startSubprocess("git push");
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    try {
      ctx.logSubprocess("Reading branch…");
      const branchResult = await ctx.toolClient.callTool("bash", {
        command: "git rev-parse --abbrev-ref HEAD",
      });
      const branch = branchResult.content.trim();

      if (!branch || branch === "HEAD") {
        append("Not on a branch — cannot push.");
        return;
      }

      ctx.logSubprocess(`Pushing \`${branch}\`…`);
      const pushResult = await ctx.toolClient.callTool("bash", {
        command: `git push 2>&1 || git push -u origin ${branch} 2>&1`,
      });

      const output = pushResult.content.trim();
      if (output) ctx.logSubprocess(output.split("\n").at(-1) ?? output);
      ctx.logSubprocess("Refreshing local/cloud commit status…");
      await ctx.refreshWorkspaceCommits?.();
      append(output || `Pushed \`${branch}\`.`);
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      ctx.endSubprocess();
      ctx.setBusy(false);
    }
  },
};
