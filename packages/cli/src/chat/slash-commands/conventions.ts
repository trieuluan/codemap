import type { Command } from "./types.js";
import { loadOrSynthesizeAll, refreshAll, getCachedContext } from "../../agent/core/convention-synthesizer.js";

export const conventionsCommand: Command = {
  name: "conventions",
  description: "Show synthesized conventions/rules. Use 'refresh' to re-synthesize.",
  execute: async (args, ctx) => {
    const append = (content: string) =>
      ctx.setMessages((prev) => [...prev, { role: "system" as const, content }]);

    const sub = args.trim().toLowerCase();
    const model = ctx.currentModel;

    if (sub === "refresh") {
      ctx.setBusy(true);
      append("Re-synthesizing conventions and rules in parallel…");
      try {
        const result = await refreshAll(ctx.provider, model);
        if (!result) {
          append("No convention/rule files found in workspace.");
        } else {
          const parts: string[] = [];
          if (result.conventions) parts.push(`### Conventions\n${result.conventions}`);
          if (result.rules) parts.push(`### Rules\n${result.rules}`);
          append(`**Refreshed** (2 synthesis runs in parallel)\n\n${parts.join("\n\n---\n\n")}`);
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
      const hasCache = cached.conventions || cached.rules;

      if (!hasCache) {
        append("No cache found. Synthesizing now (running 2 streams in parallel)…");
        const result = await loadOrSynthesizeAll(ctx.provider, model);
        if (!result) {
          append("No convention/rule files found in workspace.");
          ctx.setBusy(false);
          return;
        }
        cached = result;
      }

      const parts: string[] = [];
      if (cached.conventions) parts.push(`### Conventions\n${cached.conventions}`);
      if (cached.rules) parts.push(`### Rules\n${cached.rules}`);

      append(`**Project context** (2 synthesized files)\n\n${parts.join("\n\n---\n\n")}\n\n---\n_/conventions refresh — re-synthesize from source files_`);
    } catch (err) {
      append(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    ctx.setBusy(false);
  },
};
