import {
  Container,
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  ProcessTerminal,
  TUI,
} from "@earendil-works/pi-tui";
import type { ChatTerminal } from "./chat-terminal.js";
import { ChatScreen, isActiveTaskPhase } from "./pi-tui/chat-screen.js";
import { completeCommand } from "./pi-tui/input.js";
import {
  clampMessageOffset,
  isSgrMouseEvent,
  pageScrollStep,
  parseMouseWheel,
  wheelScrollStep,
} from "./pi-tui/scroll.js";
import {
  BOLD,
  C_CYAN,
  C_GRAY,
  C_WHITE,
  DISABLE_MOUSE_TRACKING,
  ENABLE_MOUSE_TRACKING,
  RESET,
} from "./pi-tui/theme.js";

export async function startPiTuiApp(chatTerminal: ChatTerminal): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal, true);

  const editorTheme: EditorTheme = {
    borderColor: (str) => `${C_GRAY}${str}${RESET}`,
    selectList: {
      selectedPrefix: (s) => `${C_CYAN}> ${RESET}${s}`,
      selectedText: (s) => `${C_WHITE}${BOLD}${s}${RESET}`,
      description: (s) => `${C_GRAY}${s}${RESET}`,
      scrollInfo: (s) => `${C_GRAY}${s}${RESET}`,
      noMatch: (s) => `${C_GRAY}${s}${RESET}`,
    },
  };
  const editor = new Editor(tui, editorTheme);
  const root = new Container();
  const screen = new ChatScreen(chatTerminal, editor);
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    terminal.write(DISABLE_MOUSE_TRACKING);
    tui.stop();
  };

  editor.onSubmit = (value) => {
    const trimmed = value.trim();
    if (!trimmed || chatTerminal.store.getState().input.busy) return;
    chatTerminal.store.dispatch((prev) => ({
      input: { ...prev.input, history: [...prev.input.history, trimmed] },
    }));
    editor.addToHistory(trimmed);
    editor.setText("");
    void chatTerminal.handleSubmit(trimmed);
  };

  root.addChild(screen);
  tui.addChild(root);
  tui.setFocus(editor);

  const unsubscribe = chatTerminal.bus.on("screen:refresh", () => {
    const state = chatTerminal.store.getState();
    tui.requestRender();
    terminal.setProgress(state.task.phase !== "idle" && state.task.phase !== "done");
  });

  const tick = setInterval(() => {
    if (isActiveTaskPhase(chatTerminal.store.getState().task.phase)) tui.requestRender();
  }, 250);

  tui.addInputListener((data) => {
    const state = chatTerminal.store.getState();

    if (matchesKey(data, Key.ctrl("c"))) {
      const st = chatTerminal.store.getState();
      if (st.input.busy) {
        chatTerminal.cancelTask();
        return { consume: true };
      }
      if (editor.getText().length > 0) {
        editor.setText("");
        tui.requestRender();
        return { consume: true };
      }
      clearInterval(tick);
      stop();
      process.exit(0);
    }

    // Close help screen on Escape
    if (matchesKey(data, Key.escape) && state.screen === "help") {
      chatTerminal.store.dispatch({ screen: "main" });
      return { consume: true };
    }

    if (state.confirm.active) {
      if (data === "y") chatTerminal.resolveConfirm(true);
      else if (data === "a") chatTerminal.resolveConfirmAll();
      else if (data === "n" || matchesKey(data, Key.escape)) chatTerminal.resolveConfirm(false);
      return { consume: true };
    }

    const wheelDirection = parseMouseWheel(data);
    if (wheelDirection) {
      const step = wheelScrollStep();
      const offset = wheelDirection < 0
        ? clampMessageOffset(state, state.messageScroll.offset + step)
        : clampMessageOffset(state, state.messageScroll.offset - step);
      chatTerminal.store.dispatch({ messageScroll: { offset, autoScroll: offset === 0 } });
      return { consume: true };
    }
    if (isSgrMouseEvent(data)) return { consume: true };

    if (matchesKey(data, Key.pageUp)) {
      const offset = clampMessageOffset(state, state.messageScroll.offset + pageScrollStep(state));
      chatTerminal.store.dispatch({ messageScroll: { offset, autoScroll: false } });
      return { consume: true };
    }
    if (matchesKey(data, Key.pageDown)) {
      const offset = clampMessageOffset(state, state.messageScroll.offset - pageScrollStep(state));
      chatTerminal.store.dispatch({ messageScroll: { offset, autoScroll: offset === 0 } });
      return { consume: true };
    }

    if (matchesKey(data, Key.tab)) {
      completeCommand(editor);
      return { consume: true };
    }

    return undefined;
  });

  process.once("exit", () => {
    clearInterval(tick);
    stop();
  });

  tui.start();
  terminal.write(ENABLE_MOUSE_TRACKING);
  tui.requestRender(true);

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (stopped) {
        clearInterval(interval);
        clearInterval(tick);
        resolve();
      }
    }, 50);
  });
}
