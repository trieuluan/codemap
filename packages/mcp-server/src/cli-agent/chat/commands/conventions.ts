import type { Command } from "./types.js";
import { loadOrSynthesizeConventions, refreshConventions } from "../../convention-synthesizer.js";

export const conventionsCommand: Command = {
  name: "conventions",
  description: "Show synthesized project conventions. Use 'refresh' to re-synthesize from source files.",
  execute: async (args, ctx) => {
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    const sub = args.trim().toLowerCase();
    const profiles = (ctx as unknown as { profiles?: Array<{ id: string; model: string }> }).profiles;
    const plannerModel =
      profiles?.find((p) => p.id === "planner")?.model ??
      profiles?.find((p) => p.id === "coder")?.model ??
      ctx.currentModel;

    if (sub === "refresh") {
      ctx.setBusy(true);
      append("Re-synthesizing project conventions…");
      try {
        const result = await refreshConventions(ctx.provider, plannerModel);
        if (!result) {
          append("No convention files found in workspace.");
        } else {
          append(
            `**Conventions refreshed** · ${result.fileCount} files · ~${result.tokenCount} tokens\n\n${result.content}`,
          );
        }
      } catch (err) {
        append(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      ctx.setBusy(false);
      return;
    }

    // Show current (load or synthesize if not cached)
    ctx.setBusy(true);
    try {
      const result = await loadOrSynthesizeConventions(ctx.provider, plannerModel);
      if (!result) {
        append(
          "No convention files found.\n\nSupported: `CLAUDE.md`, `.claude/rules/*.md`, `.cursorrules`, `.cursor/rules/*.mdc`, `.windsurfrules`, `.github/copilot-instructions.md`, `.clinerules`, `AGENTS.md`, `CONVENTIONS.md`",
        );
      } else {
        const source = result.fromCache ? "cached" : "freshly synthesized";
        append(
          `**Project conventions** (${source} · ${result.fileCount} files · ~${result.tokenCount} tokens)\n\n${result.content}\n\n---\n_/conventions refresh — re-synthesize from source files_`,
        );
      }
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    ctx.setBusy(false);
  },
};
