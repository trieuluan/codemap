import type { Command } from "./types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const importCommand: Command = {
  name: "import",
  description: "Trigger a CodeMap reimport and wait for it to finish. Usage: /import [<project-id>]",
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

      await ctx.toolClient.callTool("trigger_reimport", toolArgs);

      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: "Import started. Waiting for completion..." },
      ]);

      // Poll until both import and parse phases are done (max ~10 min).
      // wait_for_import returns "Next action: wait_for_import" in its text
      // output when the parse phase is still running after import completes.
      const MAX_POLLS = 12;
      let result = await ctx.toolClient.callTool("wait_for_import", toolArgs);
      for (let i = 0; i < MAX_POLLS; i++) {
        if (result.isError) break;
        if (!result.content.includes("Next action: wait_for_import")) break;
        result = await ctx.toolClient.callTool("wait_for_import", toolArgs);
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
