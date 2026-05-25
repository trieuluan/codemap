import { runShell } from "./shell.js";
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

    let committed = false;

    try {
      const manualMsg = args.trim();
      if (manualMsg) {
        ctx.logSubprocess("Committing with provided message…");
        const output = await runShell(`git add -A && git commit -m ${JSON.stringify(manualMsg)}`);
        committed = true;
        append(output || "Committed.");
        return;
      }

      ctx.logSubprocess("Checking status…");
      const status = await runShell("git status --short");
      if (!status.trim()) {
        append("Nothing to commit — working tree clean.");
        return;
      }

      ctx.logSubprocess("Reading diff…");
      const diffOutput = await runShell("git diff HEAD --stat && echo '---' && git diff HEAD -- . ':(exclude)package-lock.json' ':(exclude)*.lock'");
      const diff = diffOutput.slice(0, 6000);

      ctx.logSubprocess("Generating commit message…");
      let commitMsg = "";
      for await (const chunk of ctx.provider.stream({
        model: ctx.plannerModel,
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
      const commitOutput = await runShell(`git add -A && git commit -m ${JSON.stringify(commitMsg)}`);
      committed = true;

      append(`\`\`\`\n${commitMsg}\n\`\`\`\n${commitOutput}\n\n_Undo: \`git reset --soft HEAD~1\`_`);
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (committed) {
        ctx.logSubprocess("Refreshing local/cloud commit status…");
        await ctx.refreshWorkspaceCommits?.();
      }
      ctx.endSubprocess();
      ctx.setBusy(false);
    }
  },
};
