import { hasFlag, parseModeFlag } from "../args.js";
import type { GatewayCommandContext } from "../command-context.js";
import { runChatCompletion } from "../chat/completion.js";
import { hydrateMentionContext } from "../chat/mention-context.js";
import { resolveMention } from "../chat/mentions.js";
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
        const result = handleChatCommand(message, ctx.config, mode);
        if (result === "clear") history.length = 0;
        return result !== "exit";
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
