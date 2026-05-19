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
  C_PURPLE,
  C_RED,
  C_YELLOW,
  DISABLE_MOUSE_TRACKING,
  ENABLE_MOUSE_TRACKING,
  RESET,
  SPINNER,
} from "./pi-tui/theme.js";
import { fitLine, stripAnsi, workspaceStateCardLines } from "./pi-tui/text.js";
import { renderEditor } from "./pi-tui/editor-renderer.js";
import {
  buildPanel,
  buildStatusBar,
  isActiveTaskPhase,
} from "./pi-tui/panel-builder.js";

export { isActiveTaskPhase };

const SCROLL_SPEED = 3;
const EXIT_CONFIRM_WINDOW_MS = 2000;
// Border characters used in copy mode.
const BDR = { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", ml: "├", mr: "┤" };

export async function startPiTuiApp(chatTerminal: ChatTerminal): Promise<void> {
  const W = () => process.stdout.columns || 80;
  const R = () => process.stdout.rows || 24;

  const terminal = new ProcessTerminal();

  // ── render state ──────────────────────────────────────────────────────────
  let stopped = false;
  let currentBottomHeight = 0;
  let editorStartInPanel = 0;
  let scrollOffset = 0;
  let copyMode = false;
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
  const slashCommands: { value: string; description: string }[] = [
    { value: "/plan", description: "Plan then implement: planner → coder → reviewer" },
    ...getCommandList().map((c) => ({ value: `/${c.name}`, description: c.description })),
  ].sort((a, b) => a.value.localeCompare(b.value));
  editor.setAutocompleteProvider(new MentionAutocompleteProvider(slashCommands));

  editor.onSubmit = (value) => {
    const trimmed = value.trim();
    const state = chatTerminal.store.getState();

    // Plan review: non-empty text is feedback to revise the plan.
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
    scrollOffset = 0;
    shellMode = false;
    void chatTerminal.handleSubmitWithContent(trimmed, content);
  };

  // ── layout helpers ────────────────────────────────────────────────────────

  function innerWidth(): number { return copyMode ? W() - 2 : W(); }
  function borderRows(): number { return copyMode ? 3 : 0; }

  // Absolute (1-indexed) row where the panel starts.
  //   normal: messagesHeight + 1
  //   copy:   1(top) + messagesHeight + 1(sep) + 1(panel start) = messagesHeight + 3
  function panelStartRow(messagesHeight: number): number {
    return messagesHeight + 1 + (copyMode ? 2 : 0);
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  function clearExitConfirm(): void {
    lastExitConfirmAt = 0;
    statusMessage = "";
    if (exitConfirmTimer) {
      clearTimeout(exitConfirmTimer);
      exitConfirmTimer = undefined;
    }
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

  function doRefresh(): void {
    if (stopped) return;
    const state = chatTerminal.store.getState();
    debugMode = state.debug;
    planMode = state.planMode;

    const w = W();
    const h = R();
    const iw = innerWidth();

    // Advance spinner frame once per render when active.
    if (isActiveTaskPhase(state.task.phase) || state.synthRunning) {
      frame = (frame + 1) % SPINNER.length;
    }

    const panelResult = buildPanel(state, iw, {
      editor, frame, shellMode, debugMode, copyMode, confirmSelection, confirmSignature, statusMessage,
    });
    confirmSignature = panelResult.confirmSignature;
    confirmSelection = panelResult.confirmSelection;
    editorStartInPanel = panelResult.editorStart;
    currentBottomHeight = panelResult.lines.length;
    const { lines: panel, cursorRow, cursorCol } = panelResult;

    const messagesHeight = Math.max(1, h - currentBottomHeight - borderRows());
    const allLines = [
      ...headerLines(state),
      ...workspaceStateCardLines(state.workspaceState, state.chatMode, w - 2),
      ...messageLines(state.messages, w - 2, frame),
    ];

    const maxScroll = Math.max(0, allLines.length - messagesHeight);
    scrollOffset = Math.min(scrollOffset, maxScroll);
    const startLine = Math.max(0, allLines.length - messagesHeight - scrollOffset);

    let buf = "\x1b[?2026h\x1b[?25l";
    buf += "\x1b[H";

    if (copyMode) {
      const bc = C_YELLOW;
      const hbar = BDR.h.repeat(iw);

      buf += `\x1b[2K${bc}${BDR.tl}${hbar}${BDR.tr}${RESET}\r\n`;

      for (let i = 0; i < messagesHeight; i++) {
        buf += `\x1b[2K${bc}${BDR.v}${RESET}`;
        let cell = "";
        if (i === 0 && startLine > 0) {
          cell = fitLine(`${C_GRAY}  ↑ ${startLine} line${startLine === 1 ? "" : "s"} above${RESET}`, iw);
        } else if (i === messagesHeight - 1 && scrollOffset > 0) {
          const below = allLines.length - (startLine + messagesHeight);
          if (below > 0) cell = fitLine(`${C_GRAY}  ↓ ${below} more — scroll down for latest${RESET}`, iw);
        }
        if (!cell) {
          const lineIdx = startLine + i;
          cell = fitLine(lineIdx < allLines.length ? (allLines[lineIdx] ?? "") : "", iw);
        }
        buf += `${cell}${bc}${BDR.v}${RESET}\r\n`;
      }

      buf += `\x1b[2K${bc}${BDR.ml}${hbar}${BDR.mr}${RESET}\r\n`;

      for (const [i, line] of panel.entries()) {
        buf += `\x1b[2K${bc}${BDR.v}${RESET}${fitLine(line, iw)}${bc}${BDR.v}${RESET}`;
        if (i < panel.length - 1) buf += "\r\n";
      }

      buf += `\r\n\x1b[2K${bc}${BDR.bl}${hbar}${BDR.br}${RESET}`;

      if (cursorRow >= 0) {
        buf += `\x1b[${panelStartRow(messagesHeight) + cursorRow};${cursorCol + 2}H`;
      }
    } else {
      for (let i = 0; i < messagesHeight; i++) {
        buf += "\x1b[2K";
        if (i === 0 && startLine > 0) {
          buf += fitLine(`${C_GRAY}  ↑ ${startLine} line${startLine === 1 ? "" : "s"} above${RESET}`, w);
          buf += "\r\n"; continue;
        }
        if (i === messagesHeight - 1 && scrollOffset > 0) {
          const below = allLines.length - (startLine + messagesHeight);
          if (below > 0) {
            buf += fitLine(`${C_GRAY}  ↓ ${below} more — scroll down for latest${RESET}`, w);
            buf += "\r\n"; continue;
          }
        }
        const lineIdx = startLine + i;
        if (lineIdx < allLines.length) buf += allLines[lineIdx];
        buf += "\r\n";
      }

      for (const [i, line] of panel.entries()) {
        buf += `\x1b[2K\r${line}`;
        if (i < panel.length - 1) buf += "\r\n";
      }

      if (cursorRow >= 0) {
        buf += `\x1b[${panelStartRow(messagesHeight) + cursorRow};${cursorCol + 1}H`;
      }
    }

    buf += "\x1b[?25h\x1b[?2026l";
    process.stdout.write(buf);
  }

  // Partial refresh — rewrites only the editor + status-bar rows in the panel
  // using absolute cursor addressing. Avoids a full repaint on every keystroke.
  function doEditorRefresh(): void {
    if (stopped || currentBottomHeight === 0) return;
    const state = chatTerminal.store.getState();
    debugMode = state.debug;
    planMode = state.planMode;
    const h = R();
    const iw = innerWidth();

    const { lines: editorLines, cursorRow, cursorCol } =
      renderEditor(editor, iw, editorStartInPanel, shellMode, debugMode);
    const newEditorAndBelow = editorLines.length + 1; // +1 for status bar
    const oldEditorAndBelow = currentBottomHeight - editorStartInPanel;

    const messagesHeight = Math.max(1, h - currentBottomHeight - borderRows());
    const editorAbsRow = panelStartRow(messagesHeight) + editorStartInPanel;

    let buf = "\x1b[?2026h\x1b[?25l";
    buf += `\x1b[${editorAbsRow};1H`;

    if (copyMode) {
      const bc = C_YELLOW;
      for (const l of editorLines) {
        buf += `\x1b[2K${bc}${BDR.v}${RESET}${fitLine(l, iw)}${bc}${BDR.v}${RESET}\r\n`;
      }
      buf += `\x1b[2K${bc}${BDR.v}${RESET}${fitLine(buildStatusBar(state, iw, copyMode, debugMode, statusMessage), iw)}${bc}${BDR.v}${RESET}`;
    } else {
      for (const l of editorLines) buf += `\x1b[2K\r${l}\r\n`;
      buf += `\x1b[2K\r${buildStatusBar(state, iw, copyMode, debugMode, statusMessage)}`;
    }

    if (newEditorAndBelow < oldEditorAndBelow) buf += "\x1b[J";

    const delta = newEditorAndBelow - oldEditorAndBelow;
    currentBottomHeight = editorStartInPanel + newEditorAndBelow;
    if (delta !== 0) scheduleRefresh();

    if (cursorRow >= 0) {
      const absRow = panelStartRow(messagesHeight) + cursorRow;
      const absCol = copyMode ? cursorCol + 2 : cursorCol + 1;
      buf += `\x1b[${absRow};${absCol}H`;
    }

    buf += "\x1b[?25h\x1b[?2026l";
    process.stdout.write(buf);
  }

  // ── input ─────────────────────────────────────────────────────────────────

  function toggleResultAt(row: number): boolean {
    const state = chatTerminal.store.getState();
    const messagesHeight = Math.max(1, R() - currentBottomHeight - borderRows());
    const lines = [...headerLines(state), ...messageLines(state.messages, W() - 2, frame)];
    const maxScroll = Math.max(0, lines.length - messagesHeight);
    const startLine = Math.max(0, lines.length - messagesHeight - Math.min(scrollOffset, maxScroll));
    const clickedLineIndex = startLine + row - 1;
    const line = stripAnsi(lines[clickedLineIndex] ?? "");
    const match = line.match(/^\s*⎿ (.+?)(?: [✓✗])?$/);
    if (!match) return false;
    const clickedToolName = match[1];

    // Multiple chat turns commonly render the same tool name (for example
    // repeated bash/search calls). Matching only by tool name toggles the
    // first/oldest message with that name, not the row the user clicked. Use
    // the rendered row position to identify the Nth visible occurrence of this
    // tool line, then toggle the corresponding Nth tool result in message order.
    let occurrence = 0;
    for (let index = 0; index <= clickedLineIndex; index += 1) {
      const renderedMatch = stripAnsi(lines[index] ?? "").match(/^\s*⎿ (.+?)(?: [✓✗])?$/);
      if (renderedMatch?.[1] === clickedToolName) occurrence += 1;
    }

    const messages = state.messages;
    for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
      const msg = messages[messageIndex];
      if (msg?.role !== "tool" || !msg.toolResults?.length) continue;
      for (let resultIndex = 0; resultIndex < msg.toolResults.length; resultIndex += 1) {
        if (msg.toolResults[resultIndex]?.name !== clickedToolName) continue;
        occurrence -= 1;
        if (occurrence !== 0) continue;
        const next = messages.map((message, index) => {
          if (index !== messageIndex || message.role !== "tool") return message;
          return { ...message, expandedResultIndex: message.expandedResultIndex === resultIndex ? undefined : resultIndex };
        });
        chatTerminal.store.dispatch({ messages: next });
        scheduleRefresh();
        return true;
      }
    }
    return false;
  }

  function onInput(data: string): void {
    if (matchesKey(data, Key.ctrl("o"))) {
      const messages = chatTerminal.store.getState().messages;
      let expandableIndex = -1;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const msg = messages[index];
        if (msg?.role === "tool" && msg.toolResults?.length) {
          expandableIndex = index;
          break;
        }
      }

      if (expandableIndex !== -1) {
        const next = [...messages];
        const msg = next[expandableIndex];
        if (msg) next[expandableIndex] = {
          ...msg,
          expandedResultIndex: msg.expandedResultIndex === undefined ? 0 : undefined,
        };
        chatTerminal.store.dispatch({ messages: next });
        scrollOffset = 0;
        scheduleRefresh();
      }
      return;
    }

    const mouseUp = data.match(/^\x1b\[<0;(\d+);(\d+)M/);
    if (mouseUp && toggleResultAt(Number(mouseUp[2]))) return;

    // Mouse scroll: SGR encoding.
    if (/^\x1b\[<64;/.test(data)) { scrollOffset += SCROLL_SPEED; scheduleRefresh(); return; }
    if (/^\x1b\[<65;/.test(data)) { scrollOffset = Math.max(0, scrollOffset - SCROLL_SPEED); scheduleRefresh(); return; }
    // Mouse scroll: X10 encoding.
    if (data.startsWith("\x1b[M") && data.length >= 6) {
      const btn = data.charCodeAt(3) - 32;
      if (btn === 64) { scrollOffset += SCROLL_SPEED; scheduleRefresh(); return; }
      if (btn === 65) { scrollOffset = Math.max(0, scrollOffset - SCROLL_SPEED); scheduleRefresh(); return; }
    }
    // PgUp / PgDn.
    if (data === "\x1b[5~") { scrollOffset += Math.max(1, R() - currentBottomHeight - borderRows() - 1); scheduleRefresh(); return; }
    if (data === "\x1b[6~") { scrollOffset = Math.max(0, scrollOffset - Math.max(1, R() - currentBottomHeight - borderRows() - 1)); scheduleRefresh(); return; }

    const state = chatTerminal.store.getState();

    // Ctrl+T: toggle copy mode.
    if (matchesKey(data, Key.ctrl("t"))) {
      copyMode = !copyMode;
      process.stdout.write(copyMode ? DISABLE_MOUSE_TRACKING : ENABLE_MOUSE_TRACKING);
      scheduleRefresh();
      return;
    }

    if (matchesKey(data, Key.ctrl("c"))) {
      handleInterrupt();
      return;
    }

    if (matchesKey(data, Key.escape) && state.screen === "help") {
      chatTerminal.store.dispatch({ screen: "main" });
      scheduleRefresh();
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

    // Plan review inline select (only when editor is empty — otherwise fall through to editor).
    if (state.planReview?.active && editor.getText().trim() === "") {
      const PLAN_OPTIONS = ["implement", "no"] as const;
      const sel = state.planReview.selection ?? 0;
      if (matchesKey(data, Key.up)) {
        chatTerminal.store.dispatch({ planReview: { active: true, selection: (sel + PLAN_OPTIONS.length - 1) % PLAN_OPTIONS.length } });
        scheduleRefresh();
        return;
      }
      if (matchesKey(data, Key.down)) {
        chatTerminal.store.dispatch({ planReview: { active: true, selection: (sel + 1) % PLAN_OPTIONS.length } });
        scheduleRefresh();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        chatTerminal.resolvePlanReview(PLAN_OPTIONS[sel] ?? "implement");
        return;
      }
      if (matchesKey(data, Key.escape)) {
        chatTerminal.resolvePlanReview("cancel");
        return;
      }
    }

    void handleEditorInput(data);
  }

  async function handleEditorInput(data: string): Promise<void> {
    try {
      const image = await imageFromPaste(data);
      if (image) {
        pendingImages.push(image);
        const current = editor.getText();
        editor.setText(current ? `${current} ${image.marker}` : image.marker);
        doEditorRefresh();
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      chatTerminal.store.dispatch((prev) => ({
        messages: [
          ...prev.messages,
          { role: "system", content: `Image paste skipped: ${message}`, timestamp: Date.now() },
        ],
      }));
      scheduleRefresh();
      return;
    }

    editor.handleInput(data);
    shellMode = editor.getText().startsWith("!");
    doEditorRefresh();
  }

  function onResize(): void {
    currentBottomHeight = 0;
    doRefresh();
  }

  terminal.start(onInput, onResize);

  // Enter alternate screen + enable mouse tracking.
  process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l" + ENABLE_MOUSE_TRACKING);

  // ── spinner tick ──────────────────────────────────────────────────────────

  const tick = setInterval(() => {
    const state = chatTerminal.store.getState();
    if (isActiveTaskPhase(state.task.phase) || state.synthRunning) doRefresh();
  }, 120);

  // ── store subscription ────────────────────────────────────────────────────

  const unsubscribe = chatTerminal.bus.on("screen:refresh", () => scheduleRefresh());

  // ── cleanup ───────────────────────────────────────────────────────────────

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
    if (copyMode) {
      copyMode = false;
      process.stdout.write(ENABLE_MOUSE_TRACKING);
      clearExitConfirm();
      scheduleRefresh();
      return;
    }
    if (state.planMode) {
      chatTerminal.store.dispatch({ planMode: false });
      clearExitConfirm();
      scheduleRefresh();
      return;
    }
    if (editor.getText().length > 0) { editor.setText(""); shellMode = false; clearExitConfirm(); doEditorRefresh(); return; }
    requestExit();
  }

  function requestExit(): void {
    const now = Date.now();
    if (now - lastExitConfirmAt <= EXIT_CONFIRM_WINDOW_MS) {
      cleanup();
      process.exit(0);
    }

    lastExitConfirmAt = now;
    statusMessage = "Press Ctrl+C again within 2s to exit";
    if (exitConfirmTimer) clearTimeout(exitConfirmTimer);
    exitConfirmTimer = setTimeout(() => {
      clearExitConfirm();
      scheduleRefresh();
    }, EXIT_CONFIRM_WINDOW_MS);
    scheduleRefresh();
  }

  function cleanup(): void {
    if (stopped) return;
    stopped = true;
    if (exitConfirmTimer) {
      clearTimeout(exitConfirmTimer);
      exitConfirmTimer = undefined;
    }
    clearInterval(tick);
    unsubscribe();
    terminal.stop();
    process.off("SIGINT", handleInterrupt);
    process.stdout.write(DISABLE_MOUSE_TRACKING + "\x1b[?1049l\r\n");
  }

  process.once("exit", cleanup);
  process.once("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", handleInterrupt);

  await initShiki().catch(() => {});

  doRefresh();

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (stopped) { clearInterval(interval); resolve(); }
    }, 50);
  });
}
