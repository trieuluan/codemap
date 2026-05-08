import { stdout as output } from "node:process";

import { NineRouterProvider } from "../provider.js";

export async function runChatCompletion(
  provider: NineRouterProvider,
  request: Parameters<NineRouterProvider["complete"]>[0],
  stream: boolean,
): Promise<string> {
  if (!stream) {
    const response = await provider.complete(request);
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
