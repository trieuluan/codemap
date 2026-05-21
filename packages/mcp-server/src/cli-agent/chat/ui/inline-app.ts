/**
 * Inline (non-alternate-screen) renderer for CodeMap Chat.
 *
 * Uses a scroll region (\x1b[1;{N}r) to split the terminal into two areas:
 *   - Rows 1..scrollBottom  : scroll region — permanent messages, native terminal scroll
 *   - Rows scrollBottom+1..H: fixed area   — streaming content + editor panel
 *
 * Messages are printed into the scroll region (terminal handles auto-scroll).
 * The fixed area is redrawn every frame using absolute cursor positioning.
 * This eliminates the "relative cursor-up" approach that breaks when the user
 * scrolls during streaming.
 */
import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  ProcessTerminal,
} from "@earendil-works/pi-tui";
import type { ChatTerminal } from "./chat-terminal.js";
import { headerLines, messageLines } from "./pi-tui/message-renderer.js";
import { MentionAutocompleteProvider } from "./pi-tui/input.js";
import { getCommandList } from "../commands/index.js";
import { initShiki } from "./pi-tui/shiki-highlight.js";
import { imageFromPaste, type PastedImage } from "./pi-tui/image-paste.js";
import {
  C_CYAN,
  C_GRAY,
  C_GREEN,
  C_MUTED,
  C_PURPLE,
  C_RED,
  RESET,
  SPINNER,
} from "./pi-tui/theme.js";
import { wrapPlain, workspaceStateCardLines } from "./pi-tui/text.js";
import { buildPanel, isActiveTaskPhase } from "./pi-tui/panel-builder.js";

export { isActiveTaskPhase };

const EXIT_CONFIRM_WINDOW_MS = 2000;

export async function startInlineApp(chatTerminal: ChatTerminal): Promise<void> {
  await initShiki().catch(() => {});

  const W = () => process.stdout.columns || 80;
  const R = () => process.stdout.rows || 24;

  const terminal = new ProcessTerminal();

  // ── render state ──────────────────────────────────────────────────────────
  let stopped = false;
  let shellMode = false;
  let debugMode = false;
  let planMode = false;
  let frame = 0;
  let refreshQueued = false;
  let confirmSelection = 0;
  let confirmSignature = "";
  let lastExitConfirmAt = 0;
  let exitConfirmTimer: NodeJS.Timeout | undefined;
  let statusMessage = "";
  const pendingImages: PastedImage[] = [];

  // ── inline-specific state ─────────────────────────────────────────────────
  let printedMsgCount = 0;    // messages permanently printed to scroll region
  let prevFixedHeight = -1;   // detect when scroll region needs updating

  // ── TUI stub ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tuiStub: any = {
    terminal: { get rows() { return R(); } },
    requestRender: () => doEditorRefresh(),
  };

  // ── editor ────────────────────────────────────────────────────────────────
  const editorTheme: EditorTheme = {
    borderColor: (str) => {
      if (shellMode) return `${C_GREEN}${str}${RESET}`;
      if (planMode) return `${C_PURPLE}${str}${RESET}`;
      if (debugMode) return `${C_RED}${str}${RESET}`;
      return `${C_GRAY}${str}${RESET}`;
    },
    selectList: {
      selectedPrefix: (s) => `${C_CYAN}> ${RESET}${s}`,
      selectedText: (s) => `\x1b[1m${s}${RESET}`,
      description: (s) => `${C_GRAY}${s}${RESET}`,
      scrollInfo: (s) => `${C_GRAY}${s}${RESET}`,
      noMatch: (s) => `${C_GRAY}${s}${RESET}`,
    },
  };

  const editor = new Editor(tuiStub, editorTheme);
  editor.focused = true;
  const slashCommands = [
    { value: "/plan", description: "Plan then implement: planner → coder → reviewer" },
    ...getCommandList().map((c) => ({ value: `/${c.name}`, description: c.description })),
  ].sort((a, b) => a.value.localeCompare(b.value));
  editor.setAutocompleteProvider(new MentionAutocompleteProvider(slashCommands));

  editor.onSubmit = (value) => {
    const trimmed = value.trim();
    const state = chatTerminal.store.getState();
    if (state.planReview?.active && trimmed) {
      editor.setText("");
      chatTerminal.resolvePlanReview(trimmed);
      return;
    }
    if (!trimmed || state.input.busy) return;

    const imageMarkdown = pendingImages.map((img) => img.markdown);
    const content = imageMarkdown.length > 0
      ? `${trimmed}\n\n${imageMarkdown.join("\n\n")}`
      : trimmed;
    pendingImages.length = 0;
    chatTerminal.store.dispatch((prev) => ({
      input: { ...prev.input, history: [...prev.input.history, trimmed] },
    }));
    editor.addToHistory(trimmed);
    editor.setText("");
    shellMode = false;
    void chatTerminal.handleSubmitWithContent(trimmed, content);
  };

  // ── message rendering ─────────────────────────────────────────────────────

  /** Render messages[from..to) as lines for permanent printing. */
  function renderMsgRange(from: number, to: number): string[] {
    const msgs = chatTerminal.store.getState().messages.slice(from, to) as Parameters<typeof messageLines>[0];
    if (msgs.length === 0) return [];
    return messageLines(msgs, W() - 2, frame);
  }

  /** Print completed messages into the scroll region (terminal auto-scrolls). */
  function flushNewMessages(scrollBottom: number): void {
    const state = chatTerminal.store.getState();
    const msgs = state.messages;
    const streamingIdx = state.streaming.active ? state.streaming.entryIndex : -1;

    if (msgs.length < printedMsgCount) {
      // /clear reset — print separator then restart from 0
      process.stdout.write(`\x1b[${scrollBottom};1H\r${C_MUTED}${"─".repeat(Math.min(W() - 2, 60))}${RESET}\n`);
      printedMsgCount = 0;
    }

    for (let i = printedMsgCount; i < msgs.length; i++) {
      if (i === streamingIdx) continue;
      const lines = renderMsgRange(i, i + 1);
      if (lines.length === 0) { printedMsgCount = i + 1; continue; }
      // Move to last line of scroll region; each \n auto-scrolls the region.
      process.stdout.write(`\x1b[${scrollBottom};1H`);
      for (const l of lines) process.stdout.write(`\r${l}\n`);
      printedMsgCount = i + 1;
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  function clearExitConfirm(): void {
    lastExitConfirmAt = 0;
    statusMessage = "";
    if (exitConfirmTimer) { clearTimeout(exitConfirmTimer); exitConfirmTimer = undefined; }
  }

  function scheduleRefresh(): void {
    if (refreshQueued || stopped) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      try { doRefresh(); } catch (e) {
        process.stderr.write(`[doRefresh error] ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
      }
    });
  }

  // ── main refresh — scroll-region approach ────────────────────────────────
  //
  // Terminal layout each frame:
  //   rows 1..scrollBottom   : scroll region — messages (terminal scrolls natively)
  //   rows scrollBottom+1..H : fixed area    — streaming content + panel
  //
  // No cursor-up tracking needed; fixed area uses absolute cursor positioning.

  function doRefresh(): void {
    if (stopped) return;
    const state = chatTerminal.store.getState();
    debugMode = state.debug;
    planMode = state.planMode;
    const w = W();
    const h = R();

    if (isActiveTaskPhase(state.task.phase) || state.synthRunning) {
      frame = (frame + 1) % SPINNER.length;
    }

    // ── build panel ──────────────────────────────────────────────────────
    const panelResult = buildPanel(state, w, {
      editor, frame, shellMode, debugMode,
      copyMode: false,
      confirmSelection, confirmSignature, statusMessage,
    });
    confirmSignature = panelResult.confirmSignature;
    confirmSelection = panelResult.confirmSelection;
    const { lines: panel, cursorRow, cursorCol } = panelResult;
    const newPanelHeight = panel.length;

    // ── compute streaming lines ──────────────────────────────────────────
    const streamContent = state.streaming.active ? (state.streaming.content ?? "") : "";
    const streamRaw = streamContent
      ? streamContent.split("\n").flatMap((l) => wrapPlain(l, w))
      : [];
    const newStreamLines = streamRaw.length;

    // ── update scroll region when layout changes ──────────────────────────
    const newFixedHeight = newPanelHeight + newStreamLines;
    const scrollBottom = Math.max(3, h - newFixedHeight);

    let buf = "\x1b[?2026h\x1b[?25l";

    if (newFixedHeight !== prevFixedHeight) {
      buf += `\x1b[1;${scrollBottom}r`; // set scroll region
      // Clear the entire fixed area to remove stale content
      for (let r = scrollBottom + 1; r <= h; r++) {
        buf += `\x1b[${r};1H\x1b[2K`;
      }
      prevFixedHeight = newFixedHeight;
    }


    // Flush new completed messages into the scroll region before drawing fixed area.
    process.stdout.write(buf);
    buf = "";
    flushNewMessages(scrollBottom);

    // ── draw streaming content in fixed area ─────────────────────────────
    const streamStartRow = scrollBottom + 1;
    for (let i = 0; i < newStreamLines; i++) {
      buf += `\x1b[${streamStartRow + i};1H\x1b[2K\r${streamRaw[i] ?? ""}`;
    }

    // ── draw panel in fixed area ─────────────────────────────────────────
    const panelStartRow = streamStartRow + newStreamLines;
    for (let i = 0; i < panel.length; i++) {
      buf += `\x1b[${panelStartRow + i};1H\x1b[2K\r${panel[i] ?? ""}`;
    }

    // ── position cursor in editor ─────────────────────────────────────────
    if (cursorRow >= 0) {
      buf += `\x1b[${panelStartRow + cursorRow};${cursorCol + 1}H`;
    } else {
      buf += `\x1b[${panelStartRow + panel.length - 1};1H`;
    }

    buf += "\x1b[?25h\x1b[?2026l";
    process.stdout.write(buf);
  }

  function doEditorRefresh(): void {
    scheduleRefresh();
  }

  // ── input handling (same as pi-tui-app) ──────────────────────────────────

  function onInput(data: string): void { void onInputAsync(data); }
  async function onInputAsync(data: string): Promise<void> {
    const state = chatTerminal.store.getState();

    if (matchesKey(data, Key.ctrl("c"))) {
      handleInterrupt();
      return;
    }

    if (state.confirm.active) {
      if (matchesKey(data, Key.up)) { confirmSelection = (confirmSelection + 2) % 3; scheduleRefresh(); }
      else if (matchesKey(data, Key.down) || matchesKey(data, Key.tab)) { confirmSelection = (confirmSelection + 1) % 3; scheduleRefresh(); }
      else if (matchesKey(data, Key.enter)) {
        if (confirmSelection === 0) chatTerminal.resolveConfirm(true);
        else if (confirmSelection === 1) chatTerminal.resolveConfirm(false);
        else chatTerminal.resolveConfirmAll();
      } else if (data === "y") chatTerminal.resolveConfirm(true);
      else if (data === "a") chatTerminal.resolveConfirmAll();
      else if (data === "n" || matchesKey(data, Key.escape)) chatTerminal.resolveConfirm(false);
      return;
    }
    confirmSignature = "";
    confirmSelection = 0;

    if (state.planReview?.active) {
      if (matchesKey(data, Key.enter) && !editor.getText().trim()) {
        chatTerminal.resolvePlanReview("approve");
        return;
      }
      if (matchesKey(data, Key.escape)) {
        chatTerminal.resolvePlanReview("cancel");
        return;
      }
    }

    if (state.input.busy) {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("g"))) {
        chatTerminal.cancelTask();
      }
      // Ignore all other input (including scroll events) while streaming.
      return;
    }

    // Paste handler
    const image = await imageFromPaste(data);
    if (image) {
      const current = editor.getText();
      editor.setText(current ? `${current} ${image.marker}` : image.marker);
      pendingImages.push(image);
      statusMessage = `Image attached (${pendingImages.length})`;
      scheduleRefresh();
      return;
    }

    // Shell mode toggle
    if (data === "!" && editor.getText() === "") {
      shellMode = !shellMode;
      scheduleRefresh();
      return;
    }

    editor.handleInput(data);
    shellMode = editor.getText().startsWith("!");
    doEditorRefresh();
  }

  function onResize(): void {
    prevFixedHeight = -1; // force scroll region update on resize
    scheduleRefresh();
  }

  // ── interrupt ─────────────────────────────────────────────────────────────

  function handleInterrupt(): void {
    const state = chatTerminal.store.getState();
    if (state.input.busy) {
      const canceledPrompt = chatTerminal.cancelTask();
      if (canceledPrompt) {
        editor.setText(canceledPrompt);
        shellMode = canceledPrompt.startsWith("!");
      }
      clearExitConfirm();
      doEditorRefresh();
      return;
    }
    const now = Date.now();
    if (now - lastExitConfirmAt < EXIT_CONFIRM_WINDOW_MS) {
      stopped = true;
      process.stdout.write("\n");
      process.exit(0);
    }
    lastExitConfirmAt = now;
    statusMessage = "Press Ctrl+C again to exit";
    scheduleRefresh();
    exitConfirmTimer = setTimeout(() => {
      statusMessage = "";
      scheduleRefresh();
    }, EXIT_CONFIRM_WINDOW_MS);
  }

  // ── print historical messages then set up scroll region ──────────────────
  const initState = chatTerminal.store.getState();
  {
    const w = W();
    const headerAndWorkspace = [
      ...headerLines(initState),
      ...workspaceStateCardLines(initState.workspaceState, initState.chatMode, w - 2),
    ];
    for (const l of headerAndWorkspace) process.stdout.write(l + "\n");

    if (initState.messages.length > 0) {
      const msgLines = messageLines(
        initState.messages as Parameters<typeof messageLines>[0],
        w - 2,
        0,
      );
      for (const l of msgLines) process.stdout.write(l + "\n");
      printedMsgCount = initState.messages.length;
    }

    // Print blank lines to push cursor down, making room for the fixed area.
    // Panel height is unknown until first doRefresh, so reserve a safe margin.
    const INIT_PANEL_RESERVE = 6;
    for (let i = 0; i < INIT_PANEL_RESERVE; i++) process.stdout.write("\n");
  }

  // ── start ─────────────────────────────────────────────────────────────────

  terminal.start(onInput, onResize);

  // No alternate screen, no mouse tracking — terminal's native scrollback works.
  process.stdout.write("\x1b[?25l"); // hide cursor until first render

  const tick = setInterval(() => {
    const state = chatTerminal.store.getState();
    if (isActiveTaskPhase(state.task.phase) || state.synthRunning) doRefresh();
  }, 120);

  const unsubscribe = chatTerminal.bus.on("screen:refresh", () => scheduleRefresh());

  function handleSigInt(): void { handleInterrupt(); }

  process.off("SIGINT", handleSigInt);
  process.on("SIGINT", handleSigInt);

  doRefresh();

  function cleanup(): void {
    if (stopped) return;
    stopped = true;
    if (exitConfirmTimer) { clearTimeout(exitConfirmTimer); exitConfirmTimer = undefined; }
    clearInterval(tick);
    unsubscribe();
    terminal.stop();
    process.off("SIGINT", handleSigInt);
    // Reset scroll region and show cursor
    process.stdout.write("\x1b[r\x1b[?25h\r\n");
  }

  process.once("exit", cleanup);
  process.once("SIGTERM", () => { cleanup(); process.exit(0); });

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (stopped) { clearInterval(interval); resolve(); }
    }, 50);
  });
}
