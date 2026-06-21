/**
 * Bridge between CLI CommandContext and shared UniversalCommandContext.
 * Allows CLI commands to delegate to shared universal commands.
 */
import type { CommandContext } from "./types.js";
import type { UniversalCommand, UniversalCommandContext } from "@codemap-ai/shared";
import { renderMarkdownish } from "../../tui/text/text.js";

/**
 * Bridge a CLI CommandContext to UniversalCommandContext and call a shared command.
 * The command's markdown output is rendered as terminal text and appended to messages.
 */
export async function executeSharedCommand(
  sharedCommand: UniversalCommand,
  args: string,
  ctx: CommandContext,
  width = 80,
): Promise<void> {
  const workspacePath = process.cwd();

  // UniversalCommandContext requires these but shared commands only return strings
  const noop = () => {};
  const noopMsg = () => ({ role: "system" as const, content: "" });

  const bridgedCtx: UniversalCommandContext = {
    currentModel: ctx.currentModel,
    availableModels: ctx.availableModels,
    toolClient: {
      callTool: (name: string, input: Record<string, unknown>) =>
        ctx.toolClient.callTool(name, input),
      listAllowedTools: () => ctx.toolClient.listAllowedTools(),
      getServerStatuses: () => {
        const statuses = ctx.toolClient.getServerStatuses?.() ?? [];
        return statuses.map((s) => ({
          name: s.name,
          connected: s.connected,
          toolCount: s.tools,
          transport: "stdio" as const,
        }));
      },
    },
    workspacePath,
    isConnected: true,
    setIsConnected: noop,
    getMessages: () => [],
    appendMessage: noopMsg,
    setMessages: noop as UniversalCommandContext["setMessages"],
  };

  try {
    const markdownOutput = await sharedCommand.execute(args, bridgedCtx);
    const terminalOutput = renderMarkdownish(markdownOutput, width, { noHighlight: false });
    ctx.setMessages((prev) => [...prev, { role: "system", content: terminalOutput.join("\n") }]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.setMessages((prev) => [
      ...prev,
      { role: "system", content: `Error executing /${sharedCommand.name}: ${msg}` },
    ]);
  }
}
