import type { Command } from "./types.js";

export const createCommand: Command = {
  name: "create",
  description:
    "Create a CodeMap project from this workspace. Usage: /create [--upload] [github <url>] [gitlab <url> [--token <tok>]]",
  execute: async (args, ctx) => {
    ctx.setBusy(true);
    try {
      const parts = args.trim().split(/\s+/).filter(Boolean);

      let toolName = "create_project";
      const toolArgs: Record<string, unknown> = {};

      if (parts[0] === "github" && parts[1]) {
        toolName = "create_project_from_github";
        toolArgs.repository_url = parts[1];
      } else if (parts[0] === "gitlab" && parts[1]) {
        toolName = "create_project_from_gitlab";
        toolArgs.repository_url = parts[1];
        const tokenIdx = parts.indexOf("--token");
        if (tokenIdx >= 0 && parts[tokenIdx + 1]) {
          toolArgs.access_token = parts[tokenIdx + 1];
        }
      } else if (parts.includes("--upload")) {
        toolArgs.upload_confirmed = true;
      }

      const result = await ctx.toolClient.callTool(toolName, toolArgs);
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
