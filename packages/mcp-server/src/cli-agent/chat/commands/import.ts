import type { Command } from "./types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importCommand: Command = {
  name: "import",
  description: "Wait for the latest CodeMap import to complete. Usage: /import [<project-id>]",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    try {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const toolArgs: Record<string, unknown> = {};
      const uuid = parts.find((p) => UUID_RE.test(p));
      if (uuid) toolArgs.project_id = uuid;

      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: "Polling import status..." },
      ]);

      const result = await ctx.toolClient.callTool("wait_for_import", toolArgs);
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
