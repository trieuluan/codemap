import type { Command } from "./types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importCommand: Command = {
  name: "import",
  description:
    "Trigger a CodeMap reimport and wait for it to finish. Usage: /import [<project-id>]",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    try {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const toolArgs: Record<string, unknown> = {};
      const uuid = parts.find((p) => UUID_RE.test(p));
      if (uuid) toolArgs.project_id = uuid;

      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: "Triggering reimport..." },
      ]);

      // First call: trigger_and_wait — triggers a new import then polls.
      // The reimport tool polls internally; if it returns timedOut=true
      // the import is still running and we continue polling.
      const MAX_POLLS = 12;
      let result = await ctx.toolClient.callTool("reimport", {
        ...toolArgs,
        action: "trigger_and_wait",
      });

      for (let i = 0; i < MAX_POLLS; i++) {
        if (result.isError) break;
        // Check if the import completed (not timed out)
        const text: string = result.content ?? "";
        if (!text.includes("still in progress") && !text.includes("timedOut")) break;
        // Continue waiting
        result = await ctx.toolClient.callTool("reimport", {
          ...toolArgs,
          action: "wait",
        });
      }

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
