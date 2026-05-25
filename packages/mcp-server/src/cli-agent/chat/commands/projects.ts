import type { Command } from "./types.js";

const VALID_STATUSES = new Set(["draft", "importing", "ready", "failed", "archived"]);

export const projectsCommand: Command = {
  name: "projects",
  description: "List CodeMap cloud projects. Usage: /projects [--status <status>]",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    try {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const toolArgs: Record<string, unknown> = {};

      const statusIdx = parts.indexOf("--status");
      if (statusIdx >= 0 && parts[statusIdx + 1]) {
        const status = parts[statusIdx + 1]!;
        if (!VALID_STATUSES.has(status)) {
          ctx.setMessages((prev) => [
            ...prev,
            {
              role: "system",
              content: `Invalid status "${status}". Valid: draft, importing, ready, failed, archived`,
            },
          ]);
          return;
        }
        toolArgs.status = status;
      }

      const result = await ctx.toolClient.callTool("list_projects", toolArgs);
      ctx.setMessages((prev) => [...prev, { role: "system", content: result.content }]);
    } catch (err) {
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      ctx.setBusy(false);
    }
  },
};
