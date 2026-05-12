/** @jsxRuntime automatic */
/** @jsxImportSource terminui */

import type { Message, UIState } from "../store.js";
import { Color } from "terminui";
import { Label, Box } from "terminui/jsx";
import { fgStyle, dimStyle, truncate } from "./helpers.js";
import type { Style } from "terminui";

export function Messages({ state, maxHeight }: { state: UIState; maxHeight: number }) {
  const { messages } = state;
  const items: ReturnType<typeof renderMessage>[] = [];

  for (const msg of messages) {
    items.push(renderMessage(msg));
  }

  return (
    <Box>
      {items.slice(-maxHeight)}
    </Box>
  );
}

function renderMessage(msg: Message) {
  switch (msg.role) {
    case "welcome":
      return null;
    case "user":
      return <Label style={fgStyle(Color.Green)} text={`  You: ${msg.content}`} />;
    case "assistant":
      return <Label text={`  ${msg.content}`} />;
    case "tool":
      return renderTool(msg);
    case "system":
      return renderSystem(msg.content);
  }
}

function renderTool(msg: Message) {
  const toolLabel = msg.toolName || "tool";
  if (toolLabel.endsWith(" result")) {
    const text = truncate(msg.content, 200);
    return <Label style={dimStyle()} text={`    ${toolLabel}: ${text}`} />;
  }
  const args = truncate(msg.content, 150);
  return <Label style={fgStyle(Color.Yellow)} text={`  ${toolLabel}(${args})`} />;
}

function renderSystem(content: string) {
  const lower = content.toLowerCase();
  let color: Style["fg"] = Color.DarkGray;
  if (lower.startsWith("error") || lower.startsWith("blocked:")) {
    color = Color.Red;
  } else if (lower.startsWith("warning") || lower.startsWith("⚠")) {
    color = Color.Yellow;
  } else if (lower.startsWith("switched") || lower.startsWith("connected") || lower.startsWith("done")) {
    color = Color.Green;
  }
  return <Label style={fgStyle(color)} text={`  ${content}`} />;
}
