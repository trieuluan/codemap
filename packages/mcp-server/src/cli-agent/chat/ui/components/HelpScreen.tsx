
import { Box, Text, useInput } from "ink";

interface Props {
  onDismiss: () => void;
}

export function HelpScreen({ onDismiss }: Props) {
  useInput(() => onDismiss());

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>  CODEMAP — Commands</Text>
      <Text> </Text>
      <Text color="white">  Chat</Text>
      <Text dimColor>    Type naturally to chat with the AI agent</Text>
      <Text> </Text>
      <Text color="white">  Model</Text>
      <Text color="green">    /model              Switch AI model</Text>
      <Text color="green">    /model {"<name>"}       Switch to specific model</Text>
      <Text> </Text>
      <Text color="white">  Mode</Text>
      <Text color="yellow">    /mode               Change gateway mode</Text>
      <Text dimColor>    local-only          No cloud calls</Text>
      <Text dimColor>    ask-before-cloud    Confirm before cloud</Text>
      <Text dimColor>    cloud-ok            Allow cloud calls</Text>
      <Text dimColor>    hybrid              Best of both</Text>
      <Text> </Text>
      <Text color="white">  Tools</Text>
      <Text color="cyan">    /retry              Resend last message</Text>
      <Text color="cyan">    /clear              Clear message history</Text>
      <Text> </Text>
      <Text color="white">  Other</Text>
      <Text color="magenta">    /debug              Toggle debug logging</Text>
      <Text color="magenta">    /exit               Quit CodeMap</Text>
      <Text> </Text>
      <Text dimColor>  Press any key to return...</Text>
    </Box>
  );
}
