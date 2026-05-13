import { CURSOR_MARKER, Editor, type EditorTheme, Key, matchesKey, ProcessTerminal, visibleWidth } from "@earendil-works/pi-tui";
import type { ChatTerminal } from "./chat-terminal.js";
import type { UIState } from "./store.js";
import { formatElapsed, formatTokenCount, truncate } from "./ink-utils.js";
import { headerLines, messageLines } from "./pi-tui/message-renderer.js";
import { MentionAutocompleteProvider } from "./pi-tui/input.js";
import {
  BOLD,
  C_CYAN,
  C_GRAY,
  C_GREEN,
  C_RED,
  C_WHITE,
  C_YELLOW,
  RESET,
  SPINNER,
} from "./pi-tui/theme.js";
import { fitLine } from "./pi-tui/text.js";
import { getModeDisplay } from "../commands/route-policy.js";

function isActiveTaskPhase(phase: UIState["task"]["phase"]): boolean {
  return phase === "thinking" || phase === "tool" || phase === "streaming";
}

export { isActiveTaskPhase };

export async function startPiTuiApp(chatTerminal: ChatTerminal): Promise<void> {
  const W = () => process.stdout.columns || 80;
  const R = () => process.stdout.rows || 24;

  // ProcessTerminal handles raw mode, StdinBuffer (sequence splitting),
  // bracketed paste, and Kitty keyboard protocol — used for input only.
  const terminal = new ProcessTerminal();

  // ── render state ──────────────────────────────────────────────────────────
  let stopped = false;
  let bottomHeight = 0;         // lines currently in the bottom panel
  let printedMsgCount = 0;      // messages committed to scrollback
  let frame = 0;                // spinner frame index
  // How many lines the hardware cursor is ABOVE the "below-panel" row.
  // After each refresh we reposition cursor into the editor for IME;
  // linesFromCursorToEnd records the upward offset so the next refresh
  // can move back down using relative CUD (immune to scrollback shifts).
  let linesFromCursorToEnd = 0;
  // Where the editor starts within the bottom panel (lines from panel top).
  // Tracked so doEditorRefresh() can skip re-rendering the static upper part.
  let editorStartInPanel = 0;
  // Lines of the active streaming message currently written into the scrollback.
  // On each doRefresh these are erased together with the panel and rewritten,
  // giving a smooth in-place update instead of a flash-then-commit effect.
  let streamingLinesInScrollback = 0;
  // Debounce: coalesce rapid full-refresh calls into one microtask flush.
  let refreshQueued = false;

  // ── TUI stub — Editor only needs terminal.rows + requestRender() ──────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tuiStub: any = {
    terminal: { get rows() { return R(); } },
    requestRender: () => doEditorRefresh(),
  };

  // ── editor ────────────────────────────────────────────────────────────────
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

  const editor = new Editor(tuiStub, editorTheme);
  editor.focused = true;
  editor.setAutocompleteProvider(new MentionAutocompleteProvider());

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

  // ── rendering ─────────────────────────────────────────────────────────────

  function scheduleRefresh(): void {
    if (refreshQueued || stopped) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      doRefresh();
    });
  }

  function doRefresh(): void {
    if (stopped) return;
    const state = chatTerminal.store.getState();
    const w = W();
    const streaming = state.task.phase === "streaming";

    // Synchronized output + hide cursor: terminal buffers all rendering until the
    // closing sequence, then paints everything at once — no flicker on message commit.
    let buf = "\x1b[?2026h\x1b[?25l";

    // Restore cursor to the "below-panel" row using relative CUD.
    // Unlike DECSC/DECRC, relative movement is not affected by scrollback shifts
    // that occur when committed messages push the panel down.
    if (linesFromCursorToEnd > 0) {
      buf += `\x1b[${linesFromCursorToEnd}B\r`;
      linesFromCursorToEnd = 0;
    }

    // Erase panel + streaming content that was written to scrollback last frame.
    // Both are erased together so there is no gap between the two areas.
    const totalErase = bottomHeight + streamingLinesInScrollback;
    if (totalErase > 0) {
      buf += `\x1b[${totalErase}A\x1b[J`;
    }
    bottomHeight = 0;
    streamingLinesInScrollback = 0;

    // /clear resets the message array — print a visual divider and reset counter.
    if (state.messages.length < printedMsgCount) {
      buf += `${C_GRAY}${"─".repeat(Math.max(0, w - 1))}${RESET}\r\n`;
      printedMsgCount = 0;
    }

    // Commit complete non-streaming messages to scrollback.
    const commitUntil = streaming
      ? Math.max(printedMsgCount, state.messages.length - 1)
      : state.messages.length;

    if (commitUntil > printedMsgCount) {
      const batch = state.messages.slice(printedMsgCount, commitUntil);
      const lines = messageLines(batch, w - 2);
      buf += lines.join("\r\n") + "\r\n";
      printedMsgCount = commitUntil;
    }

    // Write the active streaming message directly into the scrollback so it
    // grows smoothly with each token — no flash when streaming ends.
    if (streaming && state.messages.length > 0) {
      const streamingMsg = state.messages[state.messages.length - 1]!;
      const sLines = messageLines([streamingMsg], w - 2);
      buf += sLines.join("\r\n") + "\r\n";
      streamingLinesInScrollback = sLines.length;
    }

    // Draw the bottom panel (no streaming preview — content is in scrollback).
    const { lines: bottom, cursorRow, cursorCol, editorStart } = buildBottom(state, w);
    editorStartInPanel = editorStart;
    buf += bottom.join("\r\n") + "\r\n";
    bottomHeight = bottom.length;

    // Reposition hardware cursor inside the editor for macOS IME support.
    // CUU (cursor up) is relative — safe across scrollback shifts.
    if (cursorRow >= 0) {
      const upLines = bottomHeight - cursorRow; // lines from below-panel to editor row
      if (upLines > 0) buf += `\x1b[${upLines}A`;
      buf += `\x1b[${cursorCol + 1}G`; // column is 1-indexed
      linesFromCursorToEnd = upLines;   // remember offset for next doRefresh
    } else {
      linesFromCursorToEnd = 0;
    }
    buf += "\x1b[?25h\x1b[?2026l";

    process.stdout.write(buf);
  }

  function statusBarLine(state: UIState, w: number): string {
    const workspace = state.workspace?.repoName ?? state.config.profile;
    const branch = state.workspace?.branch ? `/${state.workspace.branch}` : "";
    const modeInfo = getModeDisplay(state.config.mode);
    return fitLine(
      `${C_WHITE}${workspace}${RESET}${C_GRAY}${branch} · ${RESET}` +
        `${C_WHITE}${truncate(state.config.model, 24)}${RESET}${C_GRAY} · ${RESET}` +
        `${C_GREEN}${modeInfo.label}${RESET}${C_GRAY} · ${RESET}` +
        `${C_CYAN}MCP connected${RESET}`,
      w,
    );
  }

  // Renders just the editor lines (+ autocomplete if active) with CURSOR_MARKER stripped.
  // Returns the lines and the cursor position within those lines.
  function renderEditor(w: number, offsetInPanel: number): {
    lines: string[];
    cursorRow: number; // absolute row within bottom panel
    cursorCol: number;
  } {
    const lines: string[] = [];
    let cursorRow = -1;
    let cursorCol = 0;
    for (const [i, l] of editor.render(w).entries()) {
      const markerIdx = l.indexOf(CURSOR_MARKER);
      if (markerIdx >= 0) {
        cursorRow = offsetInPanel + i;
        cursorCol = visibleWidth(l.slice(0, markerIdx));
        lines.push(l.replace(CURSOR_MARKER, ""));
      } else {
        lines.push(l);
      }
    }
    return { lines, cursorRow, cursorCol };
  }

  // Fast partial refresh — overwrites only the editor area + status bar in-place.
  // No \x1b[J] clear in the common case (stable line count), so zero flicker.
  // Falls back to clearing only the orphaned tail when autocomplete disappears.
  function doEditorRefresh(): void {
    if (stopped) return;
    const state = chatTerminal.store.getState();
    const w = W();

    const { lines: editorLines, cursorRow, cursorCol } = renderEditor(w, editorStartInPanel);
    const newEditorAndBelow = editorLines.length + 1; // +1 for status bar
    const oldEditorAndBelow = bottomHeight - editorStartInPanel;

    // Synchronized output: terminal buffers all rendering until the closing
    // sequence, then paints everything at once — eliminates text/cursor flicker.
    let buf = "\x1b[?2026h\x1b[?25l";

    // Return cursor to "below-panel" row using relative CUD.
    if (linesFromCursorToEnd > 0) {
      buf += `\x1b[${linesFromCursorToEnd}B\r`;
      linesFromCursorToEnd = 0;
    }

    // Move up to the start of the editor area (not all the way to panel top).
    if (oldEditorAndBelow > 0) buf += `\x1b[${oldEditorAndBelow}A`;

    // Overwrite editor lines in-place. fitLine pads each line to exactly w chars
    // so old content is fully replaced without a visible clear-then-repaint flash.
    for (const l of editorLines) buf += `\r${l}\r\n`;
    buf += `\r${statusBarLine(state, w)}\r\n`;

    // If the panel shrank (autocomplete closed), clear the orphaned tail lines.
    if (newEditorAndBelow < oldEditorAndBelow) buf += "\x1b[J";

    bottomHeight = editorStartInPanel + newEditorAndBelow;

    // Reposition hardware cursor inside the editor for IME, then show it again.
    if (cursorRow >= 0) {
      const upLines = bottomHeight - cursorRow;
      if (upLines > 0) buf += `\x1b[${upLines}A`;
      buf += `\x1b[${cursorCol + 1}G`;
      linesFromCursorToEnd = upLines;
    } else {
      linesFromCursorToEnd = 0;
    }
    buf += "\x1b[?25h\x1b[?2026l";

    process.stdout.write(buf);
  }

  function buildBottom(
    state: UIState,
    w: number,
  ): { lines: string[]; cursorRow: number; cursorCol: number; editorStart: number } {
    const out: string[] = [];
    let cursorRow = -1;
    let cursorCol = 0;

    // /help overlay.
    if (state.screen === "help") {
      out.push(
        fitLine(`${C_CYAN}${BOLD}Commands${RESET}`, w),
        fitLine("  /help       Show this help", w),
        fitLine("  /model      Switch model", w),
        fitLine("  /mode       Switch gateway mode", w),
        fitLine("  /clear      Clear conversation", w),
        fitLine("  /retry      Retry last message", w),
        fitLine(`  ${C_GRAY}Esc to close${RESET}`, w),
        fitLine("", w),
      );
    }

    // Subprocess log.
    if (state.subprocess.active) {
      out.push(fitLine(`${C_YELLOW}Running:${RESET} ${state.subprocess.command}`, w));
      for (const l of state.subprocess.logLines.slice(-4)) {
        out.push(fitLine(`${C_GRAY}${l}${RESET}`, w));
      }
    }

    // Confirm dialog.
    if (state.confirm.active) {
      const preview = state.confirm.preview?.split("\n").slice(0, 8) ?? [];
      out.push(
        fitLine(`${C_YELLOW}Confirm edit:${RESET} ${state.confirm.toolName}`, w),
        fitLine(`${C_GRAY}y = yes  n = no  a = accept all${RESET}`, w),
      );
      for (const line of preview) {
        const col = line.startsWith("+") ? C_GREEN : line.startsWith("-") ? C_RED : C_GRAY;
        out.push(fitLine(`${col}${line}${RESET}`, w));
      }
    }

    // Task / progress line.
    if (state.task.phase !== "idle") {
      const active = isActiveTaskPhase(state.task.phase);
      if (active) frame = (frame + 1) % SPINNER.length;
      const endTime = active ? Date.now() : (state.task.endTime ?? Date.now());
      const elapsed = state.task.startTime
        ? formatElapsed(Math.max(0, endTime - state.task.startTime))
        : "0s";
      const turnTok = state.task.usage?.totalTokens ?? 0;
      const sessTok = state.sessionUsage.totalTokens;
      const usage =
        turnTok > 0 || sessTok > 0
          ? ` · t ${formatTokenCount(turnTok)} · s ${formatTokenCount(sessTok)} tok`
          : "";
      const tool = state.task.toolName ? ` · ${state.task.toolName}` : "";
      const marker =
        state.task.phase === "done"
          ? `${C_GREEN}✓${RESET}`
          : `${C_CYAN}${SPINNER[frame]}${RESET}`;
      out.push(fitLine(` ${marker} ${state.task.phase}${tool} · ${elapsed}${usage}`, w));
    }

    // Hint bar.
    out.push(
      fitLine(
        `  ${C_CYAN}Tab${RESET} ${C_GRAY}complete${RESET}` +
          `  ${C_CYAN}↑↓${RESET} ${C_GRAY}history${RESET}` +
          `  ${C_CYAN}@${RESET} ${C_GRAY}files${RESET}` +
          `  ${C_CYAN}/help${RESET} ${C_GRAY}commands${RESET}` +
          `  ${C_CYAN}Ctrl+C${RESET} ${C_GRAY}exit${RESET}`,
        w,
      ),
    );

    // Editor + autocomplete.
    const editorStart = out.length;
    const { lines: editorLines, cursorRow: eCursorRow, cursorCol: eCursorCol } =
      renderEditor(w, editorStart);
    cursorRow = eCursorRow;
    cursorCol = eCursorCol;
    out.push(...editorLines);

    // Status bar.
    out.push(statusBarLine(state, w));

    return { lines: out, cursorRow, cursorCol, editorStart };
  }

  // ── input ─────────────────────────────────────────────────────────────────

  function onInput(data: string): void {
    const state = chatTerminal.store.getState();

    if (matchesKey(data, Key.ctrl("c"))) {
      if (state.input.busy) { chatTerminal.cancelTask(); return; }
      if (editor.getText().length > 0) { editor.setText(""); doEditorRefresh(); return; }
      cleanup();
      process.exit(0);
    }

    if (matchesKey(data, Key.escape) && state.screen === "help") {
      chatTerminal.store.dispatch({ screen: "main" });
      scheduleRefresh();
      return;
    }

    if (state.confirm.active) {
      if (data === "y") chatTerminal.resolveConfirm(true);
      else if (data === "a") chatTerminal.resolveConfirmAll();
      else if (data === "n" || matchesKey(data, Key.escape)) chatTerminal.resolveConfirm(false);
      return;
    }

    editor.handleInput(data);
    // Editor does not call requestRender() for regular text input — only for
    // autocomplete. Partial-refresh just the editor area: no flicker, instant.
    doEditorRefresh();
  }

  function onResize(): void {
    if (linesFromCursorToEnd > 0) {
      process.stdout.write(`\x1b[${linesFromCursorToEnd}B\r`);
      linesFromCursorToEnd = 0;
    }
    const totalErase = bottomHeight + streamingLinesInScrollback;
    if (totalErase > 0) {
      process.stdout.write(`\x1b[${totalErase}A\x1b[J`);
    }
    bottomHeight = 0;
    streamingLinesInScrollback = 0;
    doRefresh();
  }

  // terminal.start() sets raw mode, StdinBuffer, Kitty protocol, resize handler.
  terminal.start(onInput, onResize);
  process.stdout.write("\x1b[?25h"); // ensure cursor visible

  // ── spinner tick ──────────────────────────────────────────────────────────

  const tick = setInterval(() => {
    if (isActiveTaskPhase(chatTerminal.store.getState().task.phase)) doRefresh();
  }, 250);

  // ── store subscription ────────────────────────────────────────────────────

  const unsubscribe = chatTerminal.bus.on("screen:refresh", () => scheduleRefresh());

  // ── cleanup ───────────────────────────────────────────────────────────────

  function cleanup(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(tick);
    unsubscribe();
    terminal.stop();
    process.stdout.write("\r\n");
  }

  process.once("exit", cleanup);

  // ── initial paint ─────────────────────────────────────────────────────────
  // Print header + pre-existing messages into scrollback, then draw the panel.

  const init = chatTerminal.store.getState();
  const initLines = [...headerLines(init), ...messageLines(init.messages, W() - 2)];
  if (initLines.length > 0) {
    process.stdout.write(initLines.join("\r\n") + "\r\n");
    printedMsgCount = init.messages.length;
  }

  doRefresh();

  // ── wait until stopped ────────────────────────────────────────────────────

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (stopped) { clearInterval(interval); resolve(); }
    }, 50);
  });
}
