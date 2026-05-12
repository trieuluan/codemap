import { useState, useEffect } from "react";
import { Box, useStdout } from "ink";
import type { UIState } from "./store.js";
import type { ChatTerminal } from "./chat-terminal.js";
import { Content } from "./components/Content.js";
import { HelpHints } from "./components/HelpHints.js";
import { TaskStatus } from "./components/TaskStatus.js";
import { StatusLine } from "./components/StatusLine.js";
import { InputArea } from "./components/InputArea.js";
import { HelpScreen } from "./components/HelpScreen.js";

// ─── Root App ─────────────────────────────────────────────

export function App({ chatTerminal }: { chatTerminal: ChatTerminal }) {
  const [state, setState] = useState<UIState>(() => chatTerminal.store.getState() as UIState);

  useEffect(() => {
    return chatTerminal.bus.on("screen:refresh", () => {
      setState({ ...(chatTerminal.store.getState() as UIState) });
    });
  }, [chatTerminal]);

  if (state.screen === "help") {
    return (
      <HelpScreen
        onDismiss={() => chatTerminal.store.dispatch({ screen: "main" })}
      />
    );
  }

  return <MainChat state={state} chatTerminal={chatTerminal} />;
}

// ─── Main layout ──────────────────────────────────────────

function MainChat({
  state,
  chatTerminal,
}: {
  state: UIState;
  chatTerminal: ChatTerminal;
}) {
  const { stdout } = useStdout();
  const termH = stdout.rows || 24;

  // Fixed bottom chrome
  const taskH      = state.task.phase !== "idle" ? 1 : 0;
  const confirmH   = state.confirm.active
    ? Math.min(12, (state.confirm.preview?.split("\n").length ?? 0) + 4)
    : 0;
  const subprocH   = state.subprocess.active ? 10 : 0;
  const bottomH    = 1 + taskH + (3 + confirmH + subprocH) + 1; // hints + task + input + status

  // Scrollable content fills everything above the fixed bottom
  const contentH = Math.max(4, termH - bottomH);

  return (
    <Box flexDirection="column">
      {/* Scrollable: header + messages as one unified view */}
      <Content state={state} height={contentH} />

      {/* Fixed bottom chrome */}
      <HelpHints />
      {state.task.phase !== "idle" && <TaskStatus state={state} />}
      <InputArea state={state} chatTerminal={chatTerminal} />
      <StatusLine state={state} />
    </Box>
  );
}
