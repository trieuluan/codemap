import { runShell } from "./shell.js";
import type { Command } from "./types.js";

const COMMIT_MSG_PROMPT = `You are a git commit message generator. Given a diff, write a concise commit message.

Rules:
- First line: max 72 chars, imperative mood ("Add feature" not "Added feature")
- No period at end of subject line
- If needed, blank line then bullet points explaining WHY (not what the diff shows)
- Output ONLY the commit message, nothing else`;

const REVIEW_PROMPT = `You are a senior code reviewer. Analyze this git diff for issues.

Focus on:
- Security: hardcoded secrets, SQL injection, XSS, unsafe eval, missing auth checks
- Bugs: logic errors, null/undefined risks, race conditions, off-by-one
- Performance: N+1 queries, unnecessary re-renders, memory leaks
- Best practices: error handling, type safety, naming

Output format (strict JSON array, nothing else):
[{"severity":"critical|high|medium|low","category":"security|bugs|performance|style","message":"short description","file":"path","line":42}]

If no issues found, return: []

Diff:`;

interface ReviewIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  message: string;
  file?: string;
  line?: number;
}

function parseReviewResponse(text: string): ReviewIssue[] {
  // Extract JSON array from response (handle markdown code blocks)
  const jsonMatch = /\[[\s\S]*\]/.exec(text);
  if (!jsonMatch) return [];
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
}

function formatReviewResult(issues: ReviewIssue[]): string {
  if (issues.length === 0) return "✅ Code review passed — no issues found";

  const critical = issues.filter((i) => i.severity === "critical");
  const high = issues.filter((i) => i.severity === "high");
  const medium = issues.filter((i) => i.severity === "medium");
  const low = issues.filter((i) => i.severity === "low");

  const lines: string[] = ["⚠️ **Code Review:**\n"];

  if (critical.length > 0) {
    lines.push(`🔴 **Critical (${critical.length}):**`);
    for (const issue of critical) {
      const loc = issue.file ? ` \`${issue.file}:${issue.line ?? ""}\`` : "";
      lines.push(`   - ${issue.message}${loc}`);
    }
  }

  if (high.length > 0) {
    lines.push(`🟠 **High (${high.length}):**`);
    for (const issue of high) {
      const loc = issue.file ? ` \`${issue.file}:${issue.line ?? ""}\`` : "";
      lines.push(`   - ${issue.message}${loc}`);
    }
  }

  if (medium.length > 0) {
    lines.push(`🟡 **Medium (${medium.length}):**`);
    for (const issue of medium.slice(0, 3)) {
      const loc = issue.file ? ` \`${issue.file}:${issue.line ?? ""}\`` : "";
      lines.push(`   - ${issue.message}${loc}`);
    }
  }

  if (low.length > 0) {
    lines.push(`⚪ **Low (${low.length}):**`);
    for (const issue of low.slice(0, 3)) {
      const loc = issue.file ? ` \`${issue.file}:${issue.line ?? ""}\`` : "";
      lines.push(`   - ${issue.message}${loc}`);
    }
  }

  return lines.join("\n");
}

export const gitCommitCommand: Command = {
  name: "commit",
  description: "AI-generated commit message [--review: run code review first] [--confirm: force commit despite review issues]",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    ctx.startSubprocess("git commit");
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    // Parse flags
    const shouldReview = args.includes("--review");
    const forceConfirm = args.includes("--confirm");
    const cleanArgs = args.replace("--review", "").replace("--confirm", "").trim();

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

      ctx.logSubprocess("Reading diff…");
      const diffOutput = await runShell("git diff HEAD --stat && echo '---' && git diff HEAD -- . ':(exclude)package-lock.json' ':(exclude)*.lock'");
      const diff = diffOutput.slice(0, 6000);

      // Run AI code review if --review flag
      let reviewIssues: ReviewIssue[] = [];
      if (shouldReview) {
        ctx.logSubprocess("AI reviewing diff…");
        let reviewResponse = "";
        for await (const chunk of ctx.provider.stream({
          model: ctx.currentModel,
          messages: [{ role: "user", content: `${REVIEW_PROMPT}\n\n${diff}` }],
        })) {
          if (chunk.text) reviewResponse += chunk.text;
        }
        reviewIssues = parseReviewResponse(reviewResponse);

        if (reviewIssues.length > 0) {
          ctx.logSubprocess(`Found ${reviewIssues.length} issue(s)`);
          const reviewResult = formatReviewResult(reviewIssues);
          append(reviewResult);

          // Block commit if critical/high issues found and --confirm not passed
          const hasBlockingIssues = reviewIssues.some(
            (i) => i.severity === "critical" || i.severity === "high"
          );
          if (hasBlockingIssues && !forceConfirm) {
            append(
              "\n❌ **Commit blocked** — critical/high issues found.\n" +
              "Fix issues and run `/commit --review` again, or use `/commit --confirm` to force commit."
            );
            return;
          }
        } else {
          ctx.logSubprocess("No issues found");
        }
      }

      ctx.logSubprocess("Generating commit message…");
      let commitMsg = "";
      for await (const chunk of ctx.provider.stream({
        model: ctx.currentModel,
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
        if (reviewIssues.length > 0) {
          resultMsg += forceConfirm
            ? `\n\n⚠️ Force committed with --confirm (${reviewIssues.length} review issue(s))`
            : `\n\n⚠️ Committed with ${reviewIssues.length} review issue(s)`;
        } else {
          resultMsg += "\n\n✅ Code review passed — no issues found";
        }
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
