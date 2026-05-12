import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { UIState } from "../store.js";
import { SPINNER_FRAMES, formatElapsed, formatTokenCount } from "../ink-utils.js";

export function TaskStatus({ state }: { state: UIState }) {
  const { task } = state;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (task.phase === "idle") return;
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [task.phase]);

  if (task.phase === "idle") return null;

  const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!;
  const elapsed = task.startTime ? formatElapsed(Date.now() - task.startTime) : "";

  let icon: string = spinner;
  let label = "";
  let color: string = "cyan";

  switch (task.phase) {
    case "thinking":  icon = spinner; label = "Thinking";            color = "cyan";   break;
    case "tool":      icon = "▶";     label = `Tool: ${task.toolName ?? "tool"}`; color = "yellow"; break;
    case "streaming": icon = spinner; label = "Streaming";           color = "green";  break;
    case "done":      icon = "✓";     label = "Done";                color = "green";  break;
  }

  const toolsInfo = task.toolsCalled > 0 ? `  · ${task.toolsCalled} tool${task.toolsCalled > 1 ? "s" : ""}` : "";
  const usageInfo = task.usage
    ? `  · ${formatTokenCount(task.usage.promptTokens + task.usage.completionTokens)} tokens`
    : "";
  const elapsedInfo = elapsed ? ` (${elapsed})` : "";

  return (
    <Box>
      <Text>{"  "}</Text>
      <Text color={color} bold>{icon}</Text>
      <Text color={color}>{`  ${label}`}</Text>
      <Text dimColor>{`${elapsedInfo}${toolsInfo}${usageInfo}`}</Text>
    </Box>
  );
}
