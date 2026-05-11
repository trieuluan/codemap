/** @jsxRuntime automatic */
/** @jsxImportSource terminui */
import { Color, Modifier, createStyle, styleFg, styleAddModifier } from "terminui";
import type { Style } from "terminui";
import { Panel, Column, Label } from "terminui/jsx";
import type { Message, UIState } from "../store.js";
import { truncate } from "./helpers.js";

const dimGray = styleFg(createStyle(), Color.Gray);
const yellowBold = styleAddModifier(styleFg(createStyle(), Color.Yellow), Modifier.BOLD);
const redBold = styleAddModifier(styleFg(createStyle(), Color.Red), Modifier.BOLD);
const greenStyle = styleFg(createStyle(), Color.Green);

export function MessagesBlock({ state }: { state: UIState }) {
  return (
    <Column>
      {state.messages.map((msg, i) => (
        <MessageItem key={i} msg={msg} />
      ))}
    </Column>
  );
}

function MessageItem({ msg }: { msg: Message }) {
  switch (msg.role) {
    case "welcome":
      return null;
    case "user":
      return <UserMessage content={msg.content} />;
    case "assistant":
      return <AssistantMessage content={msg.content} />;
    case "tool":
      return <ToolMessage msg={msg} />;
    case "system":
      return <SystemMessage content={msg.content} />;
  }
}

function UserMessage({ content }: { content: string }) {
  return (
    <Panel title="You" border p={1} fg={Color.Green}>
      <Label text={content} fg={Color.White} />
    </Panel>
  );
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <Panel title="CodeMap" border p={1} fg={Color.Cyan}>
      <Label text={content} />
    </Panel>
  );
}

function ToolMessage({ msg }: { msg: Message }) {
  // Tool result — compact inline
  if (msg.toolName?.endsWith(" result")) {
    const resultText = truncate(msg.content, 200);
    return (
      <Label>
        <Label text="↳ " style={dimGray} />
        <Label text={`${msg.toolName}: `} style={dimGray} />
        <Label text={resultText} style={dimGray} />
      </Label>
    );
  }

  // Tool call — bordered block with yellow accent
  const toolLabel = msg.toolName || "tool";
  return (
    <Panel title={toolLabel} border p={1} fg={Color.Yellow}>
      <Label text={truncate(msg.content, 200)} style={dimGray} />
    </Panel>
  );
}

function SystemMessage({ content }: { content: string }) {
  const lower = content.toLowerCase();
  let style: Style = dimGray;

  if (lower.startsWith("error") || lower.startsWith("blocked:")) {
    style = redBold;
  } else if (lower.startsWith("warning") || lower.startsWith("⚠")) {
    style = yellowBold;
  } else if (
    lower.startsWith("switched") ||
    lower.startsWith("connected") ||
    lower.startsWith("done")
  ) {
    style = greenStyle;
  }

  return (
    <Label>
      <Label text="│ " style={dimGray} />
      <Label text={content} style={style} />
    </Label>
  );
}
