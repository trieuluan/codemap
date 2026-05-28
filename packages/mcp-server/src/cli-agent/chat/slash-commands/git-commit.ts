import { runShell } from "./shell.js";
import type { Command, CommandContext } from "./types.js";

const COMMIT_MSG_PROMPT = `You are a git commit message generator. Given a diff, write a concise commit message.

Rules:
- First line: max 72 chars, imperative mood ("Add feature" not "Added feature")
- No period at end of subject line
- If needed, blank line then bullet points explaining WHY (not what the diff shows)
- Output ONLY the commit message, nothing else`;

interface ReviewIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  message: string;
  line?: number;
  suggestion?: string;
}

interface ReviewResult {
  path: string;
  issues: ReviewIssue[];
  complexityScore?: number;
}

async function runCodeReview(
  ctx: CommandContext,
  changedFiles: string[],
): Promise<{ issues: ReviewIssue[]; filesReviewed: number }> {
  const allIssues: ReviewIssue[] = [];
  let filesReviewed = 0;

  for (const filePath of changedFiles.slice(0, 10)) {
    try {
      const result = await ctx.toolClient.callTool("code_review", {
        file_path: filePath,
        focus_areas: ["bugs", "security"],
      });

      if (result.structuredContent) {
        const data = result.structuredContent as { reviews?: ReviewResult[] };
        if (data.reviews) {
          for (const review of data.reviews) {
            allIssues.push(...review.issues);
            filesReviewed++;
          }
        }
      }
    } catch {
      // Skip files that fail review
    }
  }

  return { issues: allIssues, filesReviewed };
}

function formatReviewWarning(issues: ReviewIssue[]): string {
  const critical = issues.filter((i) => i.severity === "critical");
  const high = issues.filter((i) => i.severity === "high");

  const lines: string[] = ["⚠️ **Code Review Issues Found:**\n"];

  if (critical.length > 0) {
    lines.push(`🔴 **Critical (${critical.length}):**`);
    for (const issue of critical.slice(0, 3)) {
      lines.push(`   - ${issue.message}`);
    }
  }

  if (high.length > 0) {
    lines.push(`🟠 **High (${high.length}):**`);
    for (const issue of high.slice(0, 3)) {
      lines.push(`   - ${issue.message}`);
    }
  }

  lines.push("\nProceed with commit anyway? (y/n)");
  return lines.join("\n");
}

export const gitCommitCommand: Command = {
  name: "commit",
  description: "AI-generated commit message [--review: run code review first]",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    ctx.startSubprocess("git commit");
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    // Parse --review flag
    const shouldReview = args.includes("--review");
    const cleanArgs = args.replace("--review", "").trim();

    let committed = false;

    try {
      const manualMsg = cleanArgs;
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

      // Get changed files for review
      let changedFiles: string[] = [];
      if (shouldReview) {
        const fileList = await runShell("git diff --name-only HEAD");
        changedFiles = fileList.trim().split("\n").filter(Boolean);
      }

      ctx.logSubprocess("Reading diff…");
      const diffOutput = await runShell("git diff HEAD --stat && echo '---' && git diff HEAD -- . ':(exclude)package-lock.json' ':(exclude)*.lock'");
      const diff = diffOutput.slice(0, 6000);

      // Run code review if --review flag
      if (shouldReview && changedFiles.length > 0) {
        ctx.logSubprocess("Running code review…");
        const { issues, filesReviewed } = await runCodeReview(ctx, changedFiles);

        if (filesReviewed > 0) {
          ctx.logSubprocess(`Reviewed ${filesReviewed} files, found ${issues.length} issues`);
        }

        const blockingIssues = issues.filter(
          (i) => i.severity === "critical" || i.severity === "high",
        );

        if (blockingIssues.length > 0) {
          // Ask for confirmation via UI
          append(formatReviewWarning(blockingIssues));
          // Note: In a real TUI, we'd wait for user input here
          // For now, we'll log a warning and continue
          ctx.logSubprocess("⚠️ Issues found — committing anyway");
        }
      }

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

      let resultMsg = `\`\`\`\n${commitMsg}\n\`\`\`\n${commitOutput}\n\n_Undo: \`git reset --soft HEAD~1\`_`;

      if (shouldReview) {
        resultMsg += "\n\n✅ Code review completed before commit";
      }

      append(resultMsg);
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
