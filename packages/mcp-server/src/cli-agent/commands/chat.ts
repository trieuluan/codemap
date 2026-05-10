import { hasFlag, parseModeFlag } from "../args.js";
import type { GatewayCommandContext } from "../command-context.js";
import { runAgentLoop } from "../chat/agent-loop.js";
import { runChatCompletion } from "../chat/completion.js";
import { hydrateMentionContext } from "../chat/mention-context.js";
import { resolveMention } from "../chat/mentions.js";
import { CodeMapMcpToolClient } from "../chat/mcp-tool-client.js";
import { selectChatProfile } from "../chat/profiles.js";
import { startRealtimeInput } from "../chat/realtime-input.js";
import { handleChatCommand } from "../chat/slash-commands.js";
import { NineRouterProvider } from "../provider.js";
import type { ChatMessage, GatewayConfig } from "../types.js";
import { printGatewayHint } from "./gateway-hint.js";

export async function runChat(ctx: GatewayCommandContext): Promise<void> {
  const mode = parseModeFlag(ctx.flags.mode);
  const provider = new NineRouterProvider(
    ctx.config.baseUrl,
    ctx.config.apiKey,
  );
  const availableModels = await loadGatewayModels(ctx.config, provider);
  const profile = selectChatProfile(ctx.config, ctx.flags.model, mode);
  const history: ChatMessage[] = [];
  const toolClient = new CodeMapMcpToolClient();
  let agentMode = false;

  // Try Ink TUI first, fallback to realtime-input
  try {
    const { startInkChat } = await import("../chat/ink-app.js");
    await startInkChat({
      provider,
      model: profile.model,
      toolClient,
      profileId: profile.id,
      mode: mode ?? ctx.config.mode,
    });
    await toolClient.close();
    return;
  } catch (err) {
    // Ink not available or failed, fallback to realtime-input
    if (process.env.CODEMAP_DEBUG_AGENT_TOOLS === "1") {
      console.error("[DEBUG] Ink TUI failed, falling back:", err);
    }
  }

  console.log(
    `CodeMap chat (${profile.id} -> ${profile.model}, ${mode ?? ctx.config.mode})`,
  );
  if (availableModels.length > 0) {
    console.log(`Gateway models: ${availableModels.length} available`);
  }
  console.log(`Type /help for commands, /exit to quit.`);

  startRealtimeInput({
    onMention: resolveMention,
    onSubmit: async (message) => {
      if (message.startsWith("/")) {
        const handled = await handleAgentChatCommand(message);
        if (handled) return handled !== "exit";

        const result = handleChatCommand(message, ctx.config, mode);
        if (result === "clear") history.length = 0;
        if (result === "exit") {
          await toolClient.close();
          return false;
        }
        return true;
      }

      try {
        const mentionContext = await hydrateMentionContext(message);
        for (const warning of mentionContext.warnings) {
          console.warn(`Mention warning: ${warning}`);
        }

        const userMessage: ChatMessage = {
          role: "user",
          content: mentionContext.content,
        };

        if (agentMode) {
          const result = await runAgentLoop({
            provider,
            model: profile.model,
            history,
            userMessage,
            toolClient,
          });
          if (result.unsupportedToolCalling) {
            console.log(
              "Agent tools were enabled, but this model/provider did not return native tool calls. Chat and @file context still work.",
            );
          }
          history.push(...result.messages);
          return;
        }

        const assistantMessage = await runChatCompletion(
          provider,
          {
            model: profile.model,
            system:
              "You are CodeMap LLM Gateway. Answer concisely, ask clarifying questions when needed, and focus on coding work.",
            messages: [...history, userMessage],
          },
          !hasFlag(ctx.flags, "no-stream"),
        );
        history.push(userMessage, {
          role: "assistant",
          content: assistantMessage,
        });
      } catch (error) {
        printGatewayHint(ctx.config);
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Chat request failed: ${message}`);
      }
    },
  });

  async function handleAgentChatCommand(
    rawCommand: string,
  ): Promise<"continue" | "exit" | undefined> {
    const [command, ...args] = rawCommand.split(/\s+/);
    const rest = args.join(" ").trim();

    if (command === "/agent") {
      if (rest === "on") {
        agentMode = true;
        console.log(
          "Agent mode enabled. Read tools may run automatically; patches require confirmation.",
        );
        return "continue";
      }
      if (rest === "off") {
        agentMode = false;
        console.log("Agent mode disabled.");
        return "continue";
      }
      console.log(
        `Agent mode is ${agentMode ? "on" : "off"}. Usage: /agent on|off`,
      );
      return "continue";
    }

    if (command === "/tools") {
      const tools = await toolClient.listAllowedTools();
      console.log("Agent tools:");
      for (const tool of tools) {
        console.log(
          `- ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`,
        );
      }
      return "continue";
    }

    if (command === "/diff") {
      const result = await toolClient.callTool("get_working_diff", {
        include_patch: false,
        include_untracked: true,
      });
      console.log(result.content);
      if (result.structuredContent) {
        console.log(JSON.stringify(result.structuredContent, null, 2));
      }
      return "continue";
    }

    return undefined;
  }
}

async function loadGatewayModels(
  config: GatewayConfig,
  provider: NineRouterProvider,
): Promise<string[]> {
  try {
    return await provider.listModels();
  } catch (error) {
    printGatewayHint(config);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Gateway model list unavailable: ${message}`);
    console.error("Using configured model profiles instead.");
    return [];
  }
}
