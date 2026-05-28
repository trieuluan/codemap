import type { GatewayCommandContext } from "../cli-agent/command-context.js";
import { findProfile } from "../cli-agent/policy.js";
import { NineRouterProvider } from "../cli-agent/provider.js";
import { printGatewayHint } from "./gateway-hint.js";

export async function runAsk(ctx: GatewayCommandContext): Promise<void> {
  if (!ctx.positional) throw new Error('Missing prompt. Example: codemap ask "Say hi"');
  const profile =
    findProfile(ctx.config.profiles, ctx.flags.model ?? ctx.config.defaultProfile) ??
    ctx.config.profiles[0];
  if (!profile) throw new Error("No model profiles configured for LLM Gateway.");

  const provider = new NineRouterProvider(ctx.config.baseUrl, ctx.config.apiKey);
  let response;
  try {
    response = await provider.complete({
      model: profile.model,
      messages: [
        { role: "system", content: "You are CodeMap LLM Gateway. Answer concisely and focus on coding work." },
        { role: "user", content: ctx.positional },
      ],
    });
  } catch (error) {
    printGatewayHint(ctx.config);
    throw error;
  }
  console.log(response.text);
}
