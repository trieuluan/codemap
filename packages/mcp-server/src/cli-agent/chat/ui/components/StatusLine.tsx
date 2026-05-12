
import { Box, Text } from "ink";
import type { UIState } from "../store.js";
import { getModeDisplay } from "../../commands/route-policy.js";

export function StatusLine({ state }: { state: UIState }) {
  const { config, workspace } = state;
  const modeInfo = getModeDisplay(config.mode);

  return (
    <Box>
      <Text>{"  "}</Text>
      <Text color="white">{workspace?.repoName ?? config.profile}</Text>
      {workspace?.branch && (
        <>
          <Text dimColor>{"  ⎇ "}</Text>
          <Text color="magenta">{workspace.branch}</Text>
        </>
      )}
      <Text dimColor>{"  ·  "}</Text>
      <Text dimColor>{"model: "}</Text>
      <Text color="white">{config.model}</Text>
      <Text dimColor>{"  ·  "}</Text>
      <Text dimColor>{"mode: "}</Text>
      <Text color="green">{modeInfo.label}</Text>
      <Text dimColor>{"  ·  "}</Text>
      <Text dimColor>{"MCP: "}</Text>
      <Text color="cyan">{"● Connected"}</Text>
    </Box>
  );
}
