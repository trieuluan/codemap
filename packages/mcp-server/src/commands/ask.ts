import type { GatewayCommandContext } from "../cli-agent/command-context.js";
import { NineRouterProvider } from "../cli-agent/core/provider.js";
import { printGatewayHint } from "./gateway-hint.js";

export async function runAsk(ctx: GatewayCommandContext): Promise<void> {
  if (!ctx.positional) throw new Error('Missing prompt. Example: codemap ask "Say hi"');
  const model = ctx.flags.model ?? ctx.config.defaultModel;

  const provider = new NineRouterProvider(ctx.config.baseUrl, ctx.config.apiKey);
  let response;
  try {
    response = await provider.complete({
      model,
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
