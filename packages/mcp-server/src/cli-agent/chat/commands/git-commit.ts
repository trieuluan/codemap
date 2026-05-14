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
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    try {
      // If user provided a message, skip AI generation
      const manualMsg = args.trim();
      if (manualMsg) {
        const result = await ctx.toolClient.callTool("bash", {
          command: `git add -A && git commit -m ${JSON.stringify(manualMsg)}`,
        });
        append(result.content || "Committed.");
        ctx.setBusy(false);
        return;
      }

      // Check if there's anything to commit
      const statusResult = await ctx.toolClient.callTool("bash", {
        command: "git status --short",
      });
      if (!statusResult.content.trim()) {
        append("Nothing to commit — working tree clean.");
        ctx.setBusy(false);
        return;
      }

      // Get diff for AI to analyze
      const diffResult = await ctx.toolClient.callTool("bash", {
        command: "git diff HEAD --stat && echo '---' && git diff HEAD -- . ':(exclude)package-lock.json' ':(exclude)*.lock'",
      });
      const diff = diffResult.content.slice(0, 6000); // cap to avoid token overload

      append("Generating commit message…");

      // Generate commit message using reviewer model
      let commitMsg = "";
      for await (const chunk of ctx.provider.stream({
        model: ctx.reviewerModel,
        system: COMMIT_MSG_PROMPT,
        messages: [{ role: "user", content: `Diff:\n${diff}` }],
      })) {
        if (chunk.text) commitMsg += chunk.text;
      }
      commitMsg = commitMsg.trim();

      if (!commitMsg) {
        append("Failed to generate commit message. Use `/commit <message>` instead.");
        ctx.setBusy(false);
        return;
      }

      // Commit
      const commitResult = await ctx.toolClient.callTool("bash", {
        command: `git add -A && git commit -m ${JSON.stringify(commitMsg)}`,
      });

      append(`\`\`\`\n${commitMsg}\n\`\`\`\n${commitResult.content}\n\n_Undo: \`git reset --soft HEAD~1\`_`);
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }

    ctx.setBusy(false);
  },
};
