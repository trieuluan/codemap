import type { Command } from "./types.js";

const PR_PROMPT = `You are a pull request description writer. Given commits and a diff summary, write a PR title and description.

Output format (exactly):
TITLE: <title under 70 chars>

## Summary
- <bullet>
- <bullet>

## Changes
- <key file or area changed>

## Test plan
- <what to verify>

Rules:
- Output ONLY the title and body in this exact format, nothing else
- Title: imperative mood, under 70 chars
- Be concise — 8-12 lines total`;

export const gitPrCommand: Command = {
  name: "pr",
  description: "Create a pull request with AI-generated title and description",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    ctx.startSubprocess("gh pr create");
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    try {
      ctx.logSubprocess("Checking gh CLI…");
      const ghCheck = await ctx.toolClient.callTool("bash", {
        command: "which gh 2>&1",
      });
      if (!ghCheck.content.trim().startsWith("/")) {
        append("`gh` CLI not found. Install it from https://cli.github.com then run `/pr` again.");
        return;
      }

      ctx.logSubprocess("Reading commits…");
      const baseResult = await ctx.toolClient.callTool("bash", {
        command: "git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}' || echo 'main'",
      });
      const base = baseResult.content.trim() || "main";

      const logResult = await ctx.toolClient.callTool("bash", {
        command: `git log ${base}..HEAD --oneline 2>/dev/null | head -30`,
      });
      if (!logResult.content.trim()) {
        append(`No commits ahead of \`${base}\`. Nothing to PR.`);
        return;
      }

      const diffStat = await ctx.toolClient.callTool("bash", {
        command: `git diff ${base}..HEAD --stat 2>/dev/null | tail -20`,
      });

      const context = `Commits:\n${logResult.content}\n\nChanged files:\n${diffStat.content}`;
      const extra = args.trim() ? `\nExtra context: ${args}` : "";

      ctx.logSubprocess("Generating PR description…");
      let raw = "";
      const vanillaModel =
        ctx.availableModels?.find((m) => m.startsWith("cc/") || m.startsWith("kr/")) ??
        ctx.reviewerModel;
      for await (const chunk of ctx.provider.stream({
        model: vanillaModel,
        system: PR_PROMPT,
        messages: [{ role: "user", content: context + extra }],
      })) {
        if (chunk.text) raw += chunk.text;
      }
      raw = raw.trim();

      const titleMatch = raw.match(/^TITLE:\s*(.+)/m);
      const title = titleMatch?.[1]?.trim() ?? "Update";
      const body = raw.replace(/^TITLE:.*\n?/m, "").trim();

      if (!title) {
        append("Failed to generate PR description.");
        return;
      }

      ctx.logSubprocess(`→ ${title}`);
      ctx.logSubprocess("Creating PR…");
      const prResult = await ctx.toolClient.callTool("bash", {
        command: `gh pr create --base ${base} --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} 2>&1`,
      });

      const prUrl = prResult.content.match(/https:\/\/github\.com\/\S+/)?.[0] ?? "";
      if (prUrl) ctx.logSubprocess(prUrl);
      append(`**PR created**\n\n**${title}**\n\n${body}\n\n---\n${prResult.content}`);
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      ctx.endSubprocess();
      ctx.setBusy(false);
    }
  },
};
