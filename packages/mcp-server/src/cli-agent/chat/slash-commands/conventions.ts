import type { Command } from "./types.js";
import { loadOrSynthesizeAll, refreshAll, getCachedContext } from "../../core/convention-synthesizer.js";
import { resolveGatewayModel } from "../harness/models.js";

export const conventionsCommand: Command = {
  name: "conventions",
  description: "Show synthesized conventions/rules/skills. Use 'refresh' to re-synthesize.",
  execute: async (args, ctx) => {
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    const sub = args.trim().toLowerCase();
    // Resolve current model against the available list so profile labels or stale IDs
    // don't silently produce the wrong model for convention synthesis.
    const plannerModel = resolveGatewayModel(ctx.currentModel, ctx.availableModels);

    if (sub === "refresh") {
      ctx.setBusy(true);
      append("Re-synthesizing conventions, rules and skills in parallel…");
      try {
        const result = await refreshAll(ctx.provider, plannerModel);
        if (!result) {
          append("No convention/rule/skill files found in workspace.");
        } else {
          const parts: string[] = [];
          if (result.conventions) parts.push(`### Conventions\n${result.conventions}`);
          if (result.rules) parts.push(`### Rules\n${result.rules}`);
          if (result.skills) parts.push(`### Skills\n${result.skills}`);
          append(`**Refreshed** (3 synthesis runs in parallel)\n\n${parts.join("\n\n---\n\n")}`);
        }
      } catch (err) {
        append(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      ctx.setBusy(false);
      return;
    }

    // Show cached or synthesize
    ctx.setBusy(true);
    try {
      let cached = await getCachedContext();
      const hasCache = cached.conventions || cached.rules || cached.skills;

      if (!hasCache) {
        append("No cache found. Synthesizing now (running 3 streams in parallel)…");
        const result = await loadOrSynthesizeAll(ctx.provider, plannerModel);
        if (!result) {
          append("No convention/rule/skill files found in workspace.");
          ctx.setBusy(false);
          return;
        }
        cached = result;
      }

      const parts: string[] = [];
      if (cached.conventions) parts.push(`### Conventions\n${cached.conventions}`);
      if (cached.rules) parts.push(`### Rules\n${cached.rules}`);
      if (cached.skills) parts.push(`### Skills & Workflows\n${cached.skills}`);

      append(`**Project context** (3 synthesized files)\n\n${parts.join("\n\n---\n\n")}\n\n---\n_/conventions refresh — re-synthesize from source files_`);
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    ctx.setBusy(false);
  },
};
