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
    ctx.startSubprocess("/compact");
    try {
      const { policy } = ctx.getCompactionStatus();
      ctx.logSubprocess(`Strategy: ${policy.strategy} · target ${policy.targetPercent}%`);
      ctx.logSubprocess("Analyzing conversation history...");

      const result = await ctx.compactHistory((step) => ctx.logSubprocess(step));

      ctx.endSubprocess();

      if (!result.compacted) {
        ctx.setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `Nothing to compact yet: ${result.beforeMessages} messages, ~${result.beforeTokens} tokens.`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      const pctBefore = Math.round((result.beforeTokens / policy.maxContextTokens) * 100);
      const pctAfter  = Math.round((result.afterTokens  / policy.maxContextTokens) * 100);
      const stats =
        `${pctBefore}% → ${pctAfter}%` +
        `  (~${result.beforeTokens} tok · ${result.beforeMessages} msgs` +
        ` → ~${result.afterTokens} tok · ${result.afterMessages} msgs)`;

      // Clear visible transcript and replace with summary.
      ctx.setMessages([
        {
          role: "system",
          content:
            `Context compacted: ${stats}\n\n` +
            (result.summaryText
              ? `**Summary of compacted history:**\n\n${result.summaryText}`
              : "Earlier messages were dropped to free context."),
          timestamp: Date.now(),
        },
      ]);
      // Persist immediately so resume shows compacted state, not old messages.
      ctx.persistSession();
    } catch (err) {
      ctx.endSubprocess();
      const message = err instanceof Error ? err.message : String(err);
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: `Compact failed: ${message}`, timestamp: Date.now() },
      ]);
    } finally {
      ctx.setBusy(false);
    }
  },
};
