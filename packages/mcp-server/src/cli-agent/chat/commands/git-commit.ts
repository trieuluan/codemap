import type { Command } from "./types.js";

const COMMIT_MSG_PROMPT = `You are a git commit message generator. Given a diff, write a concise commit message.

Rules:
- First line: max 72 chars, imperative mood ("Add feature" not "Added feature")
- No period at end of subject line
- If needed, blank line then bullet points explaining WHY (not what the diff shows)
- Output ONLY the commit message, nothing else`;

export const gitCommitCommand: Command = {
  name: "commit",
  description: "AI-generated commit message and commit staged/unstaged changes",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    ctx.startSubprocess("git commit");
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    try {
      const manualMsg = args.trim();
      if (manualMsg) {
        ctx.logSubprocess("Committing with provided message…");
        const result = await ctx.toolClient.callTool("bash", {
          command: `git add -A && git commit -m ${JSON.stringify(manualMsg)}`,
        });
        append(result.content || "Committed.");
        return;
      }

      ctx.logSubprocess("Checking status…");
      const statusResult = await ctx.toolClient.callTool("bash", {
        command: "git status --short",
      });
      if (!statusResult.content.trim()) {
        append("Nothing to commit — working tree clean.");
        return;
      }

      ctx.logSubprocess("Reading diff…");
      const diffResult = await ctx.toolClient.callTool("bash", {
        command: "git diff HEAD --stat && echo '---' && git diff HEAD -- . ':(exclude)package-lock.json' ':(exclude)*.lock'",
      });
      const diff = diffResult.content.slice(0, 6000);

      ctx.logSubprocess("Generating commit message…");
      let commitMsg = "";
      // cx/* and mimo/* models have fixed review system prompts in 9router that override
      // COMMIT_MSG_PROMPT. Use the first vanilla cc/* or kr/* model instead.
      const vanillaModel =
        ctx.availableModels?.find((m) => m.startsWith("cc/") || m.startsWith("kr/")) ??
        ctx.plannerModel;
      for await (const chunk of ctx.provider.stream({
        model: vanillaModel,
        messages: [{
          role: "user",
          content: `${COMMIT_MSG_PROMPT}\n\nDiff:\n${diff}`,
        }],
      })) {
        if (chunk.text) commitMsg += chunk.text;
      }
      commitMsg = commitMsg.trim();

      if (!commitMsg) {
        append("Failed to generate commit message. Use `/commit <message>` instead.");
        return;
      }

      ctx.logSubprocess(`→ ${commitMsg.split("\n")[0]}`);
      const commitResult = await ctx.toolClient.callTool("bash", {
        command: `git add -A && git commit -m ${JSON.stringify(commitMsg)}`,
      });

      append(`\`\`\`\n${commitMsg}\n\`\`\`\n${commitResult.content}\n\n_Undo: \`git reset --soft HEAD~1\`_`);
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      ctx.endSubprocess();
      ctx.setBusy(false);
    }
  },
};
