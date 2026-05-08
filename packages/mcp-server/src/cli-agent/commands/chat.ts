import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { hasFlag, parseModeFlag } from "../args.js";
import type { GatewayCommandContext } from "../command-context.js";
import { findProfile } from "../policy.js";
import { NineRouterProvider } from "../provider.js";
import type {
  ChatMessage,
  GatewayConfig,
  GatewayMode,
  ModelProfile,
} from "../types.js";
import { printGatewayHint } from "./gateway-hint.js";
import { printModels } from "./models.js";
import { runRoute } from "./route.js";

export async function runChat(ctx: GatewayCommandContext): Promise<void> {
  const mode = parseModeFlag(ctx.flags.mode);
  const provider = new NineRouterProvider(
    ctx.config.baseUrl,
    ctx.config.apiKey,
  );
  const availableModels = await loadGatewayModels(ctx.config, provider);
  const profile = selectChatProfile(
    ctx.config,
    ctx.flags.model,
    mode,
    availableModels,
  );
  const history: ChatMessage[] = [];
  const rl = createInterface({ input, output, prompt: "codemap> " });

  console.log(
    `CodeMap chat (${profile.id} -> ${profile.model}, ${mode ?? ctx.config.mode})`,
  );
  if (availableModels.length > 0) {
    console.log(`Gateway models: ${availableModels.length} available`);
  }
  console.log(`Type /help for commands, /exit to quit.`);
  promptSafely(rl);

  try {
    for await (const line of rl) {
      const message = line.trim();
      if (!message) {
        promptSafely(rl);
        continue;
      }

      if (message.startsWith("/")) {
        const shouldContinue = handleChatCommand(message, ctx.config, mode);
        if (!shouldContinue) break;
        if (getCommandName(message) === "/clear") history.length = 0;
        promptSafely(rl);
        continue;
      }

      const userMessage: ChatMessage = { role: "user", content: message };
      try {
        const assistantMessage = await runChatCompletion(provider, {
          model: profile.model,
          messages: [
            {
              role: "system",
              content:
                "You are CodeMap LLM Gateway. Answer concisely, ask clarifying questions when needed, and focus on coding work.",
            },
            ...history,
            userMessage,
          ],
        }, !hasFlag(ctx.flags, "no-stream"));
        history.push(userMessage, { role: "assistant", content: assistantMessage });
      } catch (error) {
        printGatewayHint(ctx.config);
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Chat request failed: ${message}`);
      }
      promptSafely(rl);
    }
  } finally {
    rl.close();
  }
}

function selectChatProfile(
  config: GatewayConfig,
  profileId: string | undefined,
  mode: GatewayMode | undefined,
  availableModels: string[],
): ModelProfile {
  const requestedGatewayModel = profileId
    ? buildModelProfileFromGatewayModel(profileId, availableModels)
    : undefined;
  if (requestedGatewayModel) return requestedGatewayModel;

  const requestedProfile =
    resolveConfiguredProfile(config, profileId, availableModels) ??
    (mode === "local-only"
      ? resolveConfiguredProfile(config, "local", availableModels)
      : undefined) ??
    resolveConfiguredProfile(config, config.defaultProfile, availableModels) ??
    resolveFirstGatewayModel(availableModels, mode) ??
    config.profiles[0];
  if (!requestedProfile)
    throw new Error("No model profiles configured for LLM Gateway.");
  return requestedProfile;
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

function resolveConfiguredProfile(
  config: GatewayConfig,
  profileId: string | undefined,
  availableModels: string[],
): ModelProfile | undefined {
  const profile = findProfile(config.profiles, profileId ?? "");
  if (!profile) return undefined;
  if (availableModels.length === 0 || availableModels.includes(profile.model)) {
    return profile;
  }

  const model = selectGatewayModelForTier(availableModels, profile.tier);
  if (!model) return profile;
  return {
    ...profile,
    model,
    label: `${profile.label} (${model})`,
  };
}

function buildModelProfileFromGatewayModel(
  model: string,
  availableModels: string[],
): ModelProfile | undefined {
  if (!availableModels.includes(model)) return undefined;
  const tier = inferTier(model);
  return {
    id: model,
    label: model,
    provider: "9router",
    model,
    tier,
    local: tier === "local",
  };
}

function resolveFirstGatewayModel(
  availableModels: string[],
  mode: GatewayMode | undefined,
): ModelProfile | undefined {
  const tier = mode === "local-only" ? "local" : "fast";
  const model = selectGatewayModelForTier(availableModels, tier);
  if (!model) return undefined;
  return {
    id: model,
    label: model,
    provider: "9router",
    model,
    tier: inferTier(model),
    local: inferTier(model) === "local",
  };
}

function selectGatewayModelForTier(
  availableModels: string[],
  tier: ModelProfile["tier"],
): string | undefined {
  if (tier === "local") {
    return availableModels.find(isLocalModel) ?? availableModels[0];
  }
  if (tier === "strong") {
    return (
      availableModels.find(isStrongModel) ??
      availableModels.find((model) => !isLocalModel(model)) ??
      availableModels[0]
    );
  }
  return (
    availableModels.find(isFastModel) ??
    availableModels.find((model) => !isLocalModel(model)) ??
    availableModels[0]
  );
}

function inferTier(model: string): ModelProfile["tier"] {
  if (isLocalModel(model)) return "local";
  if (isStrongModel(model)) return "strong";
  return "fast";
}

function isLocalModel(model: string): boolean {
  return /\b(local|ollama|lmstudio|llama\.cpp)\b/i.test(model);
}

function isStrongModel(model: string): boolean {
  return /\b(strong|opus|sonnet|gpt-5|gpt-4|o3|o4|deepseek-r1|qwen3-coder)\b/i.test(
    model,
  );
}

function isFastModel(model: string): boolean {
  return /\b(fast|mini|small|flash|haiku|instant|lite|qwen.*coder)\b/i.test(
    model,
  );
}

function handleChatCommand(
  rawCommand: string,
  config: GatewayConfig,
  mode: GatewayMode | undefined,
): boolean {
  const [command, ...args] = rawCommand.split(/\s+/);
  const rest = args.join(" ").trim();

  if (command === "/exit" || command === "/quit") return false;
  if (command === "/help") {
    printChatHelp();
    return true;
  }
  if (command === "/models") {
    printModels(config);
    return true;
  }
  if (command === "/route") {
    if (!rest) {
      console.log('Usage: /route "describe the task"');
      return true;
    }
    runRoute(config, rest, mode);
    return true;
  }
  if (command === "/clear") {
    clearVisibleChat();
    console.log("Conversation cleared.");
    return true;
  }

  console.log(`Unknown command "${command}". Type /help for commands.`);
  return true;
}

function printChatHelp(): void {
  console.log(`Chat commands:
  /help       Show chat commands.
  /models     Show configured model profiles.
  /route ...  Recommend a model profile for a task.
  /clear      Clear conversation history.
  /exit       Quit chat.`);
}

function getCommandName(rawCommand: string): string {
  return rawCommand.split(/\s+/, 1)[0] ?? "";
}

function clearVisibleChat(): void {
  if (!output.isTTY) return;
  output.write("\x1B[2J\x1B[3J\x1B[H");
}

async function runChatCompletion(
  provider: NineRouterProvider,
  request: Parameters<NineRouterProvider["complete"]>[0],
  stream: boolean,
): Promise<string> {
  if (!stream) {
    const response = await provider.complete(request);
    console.log(response.text);
    return response.text;
  }

  let text = "";
  for await (const chunk of provider.stream(request)) {
    text += chunk.text;
    output.write(chunk.text);
  }
  output.write("\n");
  return text;
}

function promptSafely(rl: ReturnType<typeof createInterface>): void {
  try {
    rl.prompt();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("readline was closed")
    ) {
      return;
    }
    throw error;
  }
}
