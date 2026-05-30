import type { Command } from "./types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const linkCommand: Command = {
  name: "link",
  description:
    "Link this workspace to a CodeMap project. Usage: /link [<project-id>] [--confirm] [--update-repo]",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    try {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const toolArgs: Record<string, unknown> = {};

      for (const part of parts) {
        if (UUID_RE.test(part)) toolArgs.project_id = part;
        else if (part === "--confirm") toolArgs.confirm = true;
        else if (part === "--update-repo") toolArgs.update_repo = true;
      }

      const result = await ctx.toolClient.callTool("link_project", toolArgs);
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
