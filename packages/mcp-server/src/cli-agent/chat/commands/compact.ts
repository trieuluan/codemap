import type { Command } from "./types.js";

export const compactCommand: Command = {
  name: "compact",
  description: "Compact agent context while keeping the visible transcript",
  async execute(args, ctx) {
    if (args.trim() === "status") {
      const { policy, state } = ctx.getCompactionStatus();
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Context: ~${state.estimatedTokens}/${state.maxContextTokens} tokens (${state.usagePercent}%). Auto-compact ${policy.enabled ? "enabled" : "disabled"} at ${policy.triggerPercent}% -> target ${policy.targetPercent}% using ${policy.strategy}. Compactions: ${state.compactedCount}${state.lastCompactedAt ? `, last ${state.lastStrategy}/${state.lastReason} at ${state.lastCompactedAt}` : ""}.`,
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    ctx.setBusy(true);
    try {
      const result = await ctx.compactHistory();
      const before = `${result.beforeMessages} messages, ~${result.beforeTokens} tokens`;
      const after = `${result.afterMessages} messages, ~${result.afterTokens} tokens`;
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: result.compacted
            ? `Context compacted: ${before} -> ${after}. Visible transcript was not changed.`
            : `Nothing to compact yet: ${before}.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Compact failed: ${message}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      ctx.setBusy(false);
    }
  },
};
