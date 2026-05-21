import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  ProcessTerminal,
} from "@earendil-works/pi-tui";
import type { ChatTerminal } from "./chat-terminal.js";
import { headerLines, messageLines, messageLinesFullView } from "./pi-tui/message-renderer.js";
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
import { copyToClipboard } from "./pi-tui/clipboard.js";
import { renderEditor } from "./pi-tui/editor-renderer.js";
import {
  buildPanel,
  buildStatusBar,
  isActiveTaskPhase,
} from "./pi-tui/panel-builder.js";

export { isActiveTaskPhase };

const SCROLL_SPEED = 1;
const MIN_RENDER_INTERVAL_MS = 33;
const SCROLLED_AWAY_RENDER_INTERVAL_MS = 250;
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
  // Scroll anchoring: -1 = auto-follow (always show latest content).
  // When >= 0, it is the content-line index pinned at the top of the viewport.
  // New streaming content appended below leaves the viewport completely unchanged.
  // Clears back to -1 (auto-follow) once the user scrolls to the bottom.
  let scrollAnchorLine = -1;
  let copyMode = false;
  let shellMode = false;
  let debugMode = false;
  let planMode = false;
  let frame = 0;
  let refreshQueued = false;
  let refreshTimer: NodeJS.Timeout | undefined;
  let lastRenderAt = 0;
  let lastVirtualTotal = 0;
  let lastMessagesHeight = 1;
  let focusedToolTarget: { messageIndex: number; resultIndex: number } | undefined;
  let viewMode: { messageIndex: number; scroll: number } | undefined;

  // ── diff-based screen buffer ─────────────────────────────────────────────
  // Track what's currently on screen. doRefresh only writes rows that changed,
  // reducing terminal I/O from O(H) lines per frame to O(changed_lines) per frame.
  let prevScreenLines: string[] = [];

  // ── in-app text selection ─────────────────────────────────────────────────
  // Selection is tracked in *content* space (index into virtual lines), not screen rows.
  // This way scrolling never shifts the highlight — only render converts to screen rows.
  let selStartLine = -1; let selStartCol = -1;
  let selEndLine = -1;   let selEndCol = -1;
  let mouseDown = false;
  let suppressReleaseSelection = false;
  let lastClickAt = 0;
  let lastClickLine = -1;
  let lastClickCol = -1;
  // Anchor: set on regular click — Shift+Click extends from here.
  let anchorLine = -1;   let anchorCol = -1;
  // Updated each frame so mouse handlers can convert screen row → content line.
  let visStartLine = 0;

  // ── virtualized message render cache ──────────────────────────────────────
  // Keep global content coordinates as line indexes, but avoid constructing one
  // huge allLines array on every refresh. Static chrome is materialized, message
  // blocks are cached per message, and only visible ranges are copied out.
  type VirtualLines = {
    total: number;
    getLine: (index: number) => string;
    getRange: (start: number, count: number) => string[];
  };
  type MessageBlock = {
    signature: string;
    contentRef: string;
    contentLength: number;
    lines: string[];
    start: number;
    length: number;
  };

  let _cachedBlocks: MessageBlock[] = [];
  let _cachedChromeLines: string[] = [];
  let _cachedWidth = -1;
  let _cachedChromeSignature = "";
  let _cachedMessageCount = 0;
  let _cachedVirtualTotal = 0;

  function messageRenderSignature(
    msg: ReturnType<typeof chatTerminal.store.getState>["messages"][number],
    idx: number,
    spinning: boolean,
  ): string {
    // Keep large streaming content out of the signature. For long conversations,
    // re-joining every prior message's full text on each frame creates visible
    // scroll jank even when only the final streaming message changed.
    return [
      idx,
      msg.role,
      msg.toolName ?? "",
      msg.name ?? "", // for tool_call role
      msg.expanded ? "1" : "0",
      msg.expandedResultIndex ?? "",
      msg.toolCalls?.length ?? 0,
      msg.toolResults?.length ?? 0,
      focusedToolTarget?.messageIndex === idx ? focusedToolTarget.resultIndex : "",
      viewMode ? `${viewMode.messageIndex}:${viewMode.scroll}` : "",
      spinning && msg.role === "tool" ? frame : "",
    ].join(":");
  }

  function chromeRenderSignature(state: ReturnType<typeof chatTerminal.store.getState>): string {
    return JSON.stringify([state.chatMode, state.workspaceState]);
  }

  function renderVirtualLines(state: ReturnType<typeof chatTerminal.store.getState>, w: number): VirtualLines {
    const contentWidth = w - 2;
    const spinning = isActiveTaskPhase(state.task.phase) || state.synthRunning;
    const widthChanged = w !== _cachedWidth;
    const chromeSignature = chromeRenderSignature(state);

    const chromeChanged = chromeSignature !== _cachedChromeSignature;
    if (widthChanged || chromeChanged) {
      _cachedChromeLines = [
        ...headerLines(state),
        ...workspaceStateCardLines(state.workspaceState, state.chatMode, contentWidth),
      ];
      _cachedChromeSignature = chromeSignature;
    }

    let firstDirty = 0;
    if (!widthChanged && !chromeChanged && _cachedMessageCount === state.messages.length) {
      firstDirty = state.messages.length;
      for (let idx = 0; idx < state.messages.length; idx += 1) {
        const msg = state.messages[idx];
        const prev = _cachedBlocks[idx];
        if (!msg || !prev) { firstDirty = idx; break; }
        const signature = messageRenderSignature(msg, idx, spinning);
        if (prev.signature !== signature || prev.contentRef !== msg.content) {
          firstDirty = idx;
          break;
        }
      }
    }

    const nextBlocks: MessageBlock[] = [];
    for (let idx = 0; idx < firstDirty; idx += 1) {
      const prev = _cachedBlocks[idx];
      if (prev) nextBlocks[idx] = prev;
    }

    let cursor = firstDirty > 0
      ? (nextBlocks[firstDirty - 1]?.start ?? _cachedChromeLines.length) + (nextBlocks[firstDirty - 1]?.length ?? 0)
      : _cachedChromeLines.length;
    for (let idx = firstDirty; idx < state.messages.length; idx += 1) {
      const msg = state.messages[idx];
      if (!msg) continue;
      const signature = messageRenderSignature(msg, idx, spinning);
      const prev = !widthChanged ? _cachedBlocks[idx] : undefined;
      const canFreezeStreamingAppend = scrollAnchorLine >= 0 &&
        prev?.signature === signature &&
        msg.content.length >= prev.contentLength &&
        msg.content.startsWith(prev.contentRef);
      const lines = canFreezeStreamingAppend ? prev.lines : messageLines([msg], contentWidth, frame);
      nextBlocks[idx] = {
        signature,
        contentRef: canFreezeStreamingAppend ? prev.contentRef : msg.content,
        contentLength: canFreezeStreamingAppend ? prev.contentLength : msg.content.length,
        lines,
        start: cursor,
        length: lines.length,
      };
      cursor += lines.length;
    }
    _cachedBlocks = nextBlocks;
    _cachedWidth = w;
    _cachedMessageCount = state.messages.length;
    _cachedVirtualTotal = cursor;

    const total = _cachedVirtualTotal;
    const findBlock = (index: number): MessageBlock | undefined => {
      let lo = 0;
      let hi = _cachedBlocks.length - 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const block = _cachedBlocks[mid];
        if (!block) return undefined;
        if (index < block.start) hi = mid - 1;
        else if (index >= block.start + block.length) lo = mid + 1;
        else return block;
      }
      return undefined;
    };

    const getLine = (index: number): string => {
      if (index < 0 || index >= total) return "";
      if (index < _cachedChromeLines.length) return _cachedChromeLines[index] ?? "";
      const block = findBlock(index);
      return block ? (block.lines[index - block.start] ?? "") : "";
    };

    return {
      total,
      getLine,
      getRange: (startLine: number, count: number) => {
        const out: string[] = [];
        for (let i = 0; i < count; i += 1) out.push(getLine(startLine + i));
        return out;
      },
    };
  }
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
    scrollAnchorLine = -1; // resume auto-follow to show AI response
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

  // ── scroll helpers ────────────────────────────────────────────────────────
  // All scroll actions go through these two helpers so anchor logic stays in
  // one place. doRefresh() is the only place that clears the anchor once the
  // viewport reaches the bottom.

  function scrollBy(deltaLines: number, intent: "line" | "page" | "wheel" = "line"): void {
    if (deltaLines === 0) return;

    const direction: -1 | 1 = deltaLines < 0 ? -1 : 1;
    const amount = intent === "page" ? Math.abs(deltaLines) : 1;
    const maxStart = Math.max(0, lastVirtualTotal - lastMessagesHeight);
    const current = scrollAnchorLine >= 0 ? scrollAnchorLine : visStartLine;
    const next = Math.max(0, Math.min(maxStart, current + direction * amount));

    // Reaching the bottom opts back into follow mode so new assistant output is visible.
    scrollAnchorLine = next >= maxStart ? -1 : next;
    scheduleRefresh(true);
  }

  function doScrollUp(amount: number, intent: "line" | "page" | "wheel" = "line"): void {
    scrollBy(-amount, intent);
  }

  function doScrollDown(amount: number, intent: "line" | "page" | "wheel" = "line"): void {
    scrollBy(amount, intent);
  }

  function clearExitConfirm(): void {
    lastExitConfirmAt = 0;
    statusMessage = "";
    if (exitConfirmTimer) {
      clearTimeout(exitConfirmTimer);
      exitConfirmTimer = undefined;
    }
  }

  function runScheduledRefresh(): void {
    refreshQueued = false;
    refreshTimer = undefined;
    try { doRefresh(); } catch (e) {
      process.stderr.write(`[doRefresh error] ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    }
  }

  function scheduleRefresh(immediate = false): void {
    if (stopped) return;
    if (immediate && refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
      refreshQueued = false;
    }
    if (refreshQueued) return;
    refreshQueued = true;
    const interval = scrollAnchorLine >= 0 ? SCROLLED_AWAY_RENDER_INTERVAL_MS : MIN_RENDER_INTERVAL_MS;
    const delay = immediate ? 0 : Math.max(0, interval - (Date.now() - lastRenderAt));
    if (delay === 0) {
      queueMicrotask(runScheduledRefresh);
      return;
    }
    refreshTimer = setTimeout(runScheduledRefresh, delay);
  }

  function currentMessageIndex(): number {
    if (focusedToolTarget) return focusedToolTarget.messageIndex;
    const centerLine = visStartLine + Math.floor(Math.max(1, lastMessagesHeight) / 2);
    for (const block of _cachedBlocks) {
      if (!block) continue;
      if (centerLine >= block.start && centerLine < block.start + block.length) return _cachedBlocks.indexOf(block);
    }
    return Math.max(0, chatTerminal.store.getState().messages.length - 1);
  }

  function renderViewModeVirtualLines(state: ReturnType<typeof chatTerminal.store.getState>, w: number): VirtualLines {
    if (!viewMode) return { total: 0, getLine: () => "", getRange: () => [] };
    const msg = state.messages[viewMode.messageIndex];
    if (!msg) return { total: 0, getLine: () => "", getRange: () => [] };

    const contentWidth = w - 2;
    const lines = [
      ...headerLines(state),
      ...messageLinesFullView([msg], contentWidth, frame),
    ];

    return {
      total: lines.length,
      getLine: (index: number) => lines[index] ?? "",
      getRange: (startLine: number, count: number) => lines.slice(startLine, startLine + count),
    };
  }

  function doRefresh(): void {
    if (stopped) return;
    lastRenderAt = Date.now();
    const state = chatTerminal.store.getState();
    debugMode = state.debug;
    planMode = state.planMode;

    const w = W();
    const h = R();
    const iw = innerWidth();

    if (viewMode) {
      const virtualLines = renderViewModeVirtualLines(state, w);
      const maxStart = Math.max(0, virtualLines.total - h);
      viewMode.scroll = Math.max(0, Math.min(maxStart, viewMode.scroll));
      const screenLines: string[] = new Array(h).fill("");
      for (let i = 0; i < h; i++) {
        const lineIdx = viewMode.scroll + i;
        if (i === 0 && viewMode.scroll > 0) {
          screenLines[i] = fitLine(`${C_GRAY}  ↑ ${viewMode.scroll} line${viewMode.scroll === 1 ? "" : "s"} above${RESET}`, w);
        } else if (i === h - 1 && lineIdx < virtualLines.total - 1) {
          const below = virtualLines.total - (viewMode.scroll + h);
          screenLines[i] = fitLine(`${C_GRAY}  ↓ ${below} more — Esc to close${RESET}`, w);
        } else {
          screenLines[i] = virtualLines.getLine(lineIdx);
        }
      }
      let buf = "\x1b[?2026h\x1b[?25l";
      for (let row = 0; row < h; row++) {
        if (screenLines[row] !== prevScreenLines[row]) {
          buf += `\x1b[${row + 1};1H\x1b[2K${screenLines[row] ?? ""}`;
        }
      }
      prevScreenLines = screenLines;
      buf += "\x1b[?25l\x1b[?2026l";
      process.stdout.write(buf);
      return;
    }

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
    const virtualLines = renderVirtualLines(state, w);
    lastVirtualTotal = virtualLines.total;
    lastMessagesHeight = messagesHeight;

    const maxStart = Math.max(0, virtualLines.total - messagesHeight);
    let startLine: number;
    if (scrollAnchorLine < 0) {
      // Auto-follow: always show the latest content.
      startLine = maxStart;
    } else {
      startLine = Math.min(scrollAnchorLine, maxStart);
      // Reached the bottom → resume auto-follow.
      if (startLine >= maxStart) {
        scrollAnchorLine = -1;
        startLine = maxStart;
      }
    }
    visStartLine = startLine; // keep in sync so mouse handlers can convert screen row → content line

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
        } else if (i === messagesHeight - 1 && scrollAnchorLine >= 0) {
          const below = virtualLines.total - (startLine + messagesHeight);
          if (below > 0) cell = fitLine(`${C_GRAY}  ↓ ${below} more — scroll down for latest${RESET}`, iw);
        }
        if (!cell) {
          const lineIdx = startLine + i;
          cell = fitLine(virtualLines.getLine(lineIdx), iw);
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
      // Build the expected screen content for this frame (normal mode).
      // Then diff against prevScreenLines — only write rows that changed.
      const screenLines: string[] = new Array(h).fill("");

      for (let i = 0; i < messagesHeight; i++) {
        if (i === 0 && startLine > 0) {
          screenLines[i] = fitLine(`${C_GRAY}  ↑ ${startLine} line${startLine === 1 ? "" : "s"} above${RESET}`, w);
        } else if (i === messagesHeight - 1 && scrollAnchorLine >= 0) {
          const below = virtualLines.total - (startLine + messagesHeight);
          if (below > 0) {
            screenLines[i] = fitLine(`${C_GRAY}  ↓ ${below} more — scroll down for latest${RESET}`, w);
            continue;
          }
        }
        const lineIdx = startLine + i;
        screenLines[i] = virtualLines.getLine(lineIdx);
      }

      const panelRow0 = panelStartRow(messagesHeight) - 1; // 0-indexed
      for (let i = 0; i < panel.length; i++) {
        screenLines[panelRow0 + i] = panel[i] ?? "";
      }

      // Apply character-precise selection highlight preserving text colors.
      // Selection is in content space (virtual line index); convert to screen rows here.
      if (selStartLine >= 0 && selEndLine >= 0) {
        const SEL_BG = "\x1b[48;2;38;79;120m"; // selection background (muted blue)
        const SEL_RESET = "\x1b[49m";           // reset background only, keep foreground

        /** Walk ansi-formatted line, return byte index of visible column `visTgt` (0-indexed). */
        function byteAtVisCol(line: string, visTgt: number): number {
          let vis = 0, i = 0;
          while (i < line.length && vis < visTgt) {
            if (line.charCodeAt(i) === 0x1b && line[i + 1] === "[") {
              let j = i + 2;
              while (j < line.length && !/[A-Za-z]/.test(line[j])) j++;
              i = j + 1; continue;
            }
            vis++; i++;
          }
          return i;
        }

        /** Apply SEL_BG to a portion of an ansi-formatted line, preserving foreground colors. */
        function applyBg(line: string, fromVis: number, toVis: number): string {
          const s = byteAtVisCol(line, fromVis);
          const e = byteAtVisCol(line, toVis);
          if (s >= e) return line;
          const mid = line.slice(s, e);
          // Re-inject SEL_BG after every \x1b[0m (full reset) inside selection
          const midBg = SEL_BG + mid.replace(/\x1b\[0m/g, `\x1b[0m${SEL_BG}`) + SEL_RESET;
          return line.slice(0, s) + midBg + line.slice(e);
        }

        const fwd = selStartLine < selEndLine ||
          (selStartLine === selEndLine && selStartCol <= selEndCol);
        const minLine = fwd ? selStartLine : selEndLine;
        const minC    = fwd ? selStartCol  : selEndCol;
        const maxLine = fwd ? selEndLine   : selStartLine;
        const maxC    = fwd ? selEndCol    : selStartCol;

        // Convert content indices to 1-indexed screen rows (may be outside visible area).
        const minScreenRow = minLine - startLine + 1;
        const maxScreenRow = maxLine - startLine + 1;

        // Clamp to the visible message area and iterate only over visible rows.
        const loI = Math.max(0, minScreenRow - 1);   // 0-indexed, inclusive
        const hiI = Math.min(maxScreenRow, messagesHeight); // 0-indexed, exclusive

        for (let i = loI; i < hiI; i++) {
          const screenRow1 = i + 1; // 1-indexed
          const line = screenLines[i] ?? "";
          const plainLen = stripAnsi(line).trimEnd().length;

          if (minLine === maxLine) {
            // Single content line — partial highlight
            screenLines[i] = applyBg(line, minC - 1, maxC - 1);
          } else if (screenRow1 === minScreenRow) {
            // First visible row of selection
            screenLines[i] = applyBg(line, minC - 1, plainLen);
          } else if (screenRow1 === maxScreenRow) {
            // Last row of selection
            screenLines[i] = applyBg(line, 0, maxC - 1);
          } else {
            // Middle rows (or first visible row when selection started above viewport)
            screenLines[i] = applyBg(line, 0, plainLen);
          }
        }
      }

      // Emit only changed rows using absolute cursor addressing.
      for (let row = 0; row < h; row++) {
        if (screenLines[row] !== prevScreenLines[row]) {
          buf += `\x1b[${row + 1};1H\x1b[2K${screenLines[row] ?? ""}`;
        }
      }
      prevScreenLines = screenLines;

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
    if (stopped || viewMode || currentBottomHeight === 0) return;
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

  function selectTokenAt(lineIndex: number, col: number): boolean {
    const state = chatTerminal.store.getState();
    const lines = renderVirtualLines(state, W());
    const plain = stripAnsi(lines.getLine(lineIndex)).trimEnd();
    const clicked = Math.max(0, Math.min(plain.length, col - 1));
    if (!plain || clicked >= plain.length || /\s/.test(plain[clicked] ?? "")) return false;

    const isTokenChar = (ch: string): boolean => /[\p{L}\p{N}\p{M}_\-/.@:]/u.test(ch);
    const tokenLike = isTokenChar(plain[clicked] ?? "");
    let start = clicked;
    let end = clicked + 1;

    if (tokenLike) {
      while (start > 0 && isTokenChar(plain[start - 1] ?? "")) start -= 1;
      while (end < plain.length && isTokenChar(plain[end] ?? "")) end += 1;
    }

    selStartLine = lineIndex; selStartCol = start + 1;
    selEndLine = lineIndex;   selEndCol = end + 1;
    anchorLine = lineIndex;   anchorCol = start + 1;
    statusMessage = "Selection active · Ctrl+C to copy · Esc to clear";
    scheduleRefresh();
    return true;
  }

  function hasActiveSelection(): boolean {
    return selStartLine >= 0 && selEndLine >= 0 &&
      (selStartLine !== selEndLine || selStartCol !== selEndCol);
  }

  function copyActiveSelection(stateNow = chatTerminal.store.getState()): boolean {
    if (!hasActiveSelection()) return false;

    const fwd = selStartLine < selEndLine ||
      (selStartLine === selEndLine && selStartCol <= selEndCol);
    const minLine = fwd ? selStartLine : selEndLine;
    const minC    = fwd ? selStartCol  : selEndCol;
    const maxLine = fwd ? selEndLine   : selStartLine;
    const maxC    = fwd ? selEndCol    : selStartCol;

    // Read directly from virtual content space — scroll-independent.
    const allL = renderVirtualLines(stateNow, W()).getRange(minLine, maxLine - minLine + 1);
    const text = allL.map((l, i) => {
      const plain = stripAnsi(l).trimEnd();
      if (minLine === maxLine) return plain.slice(Math.max(0, minC - 1), Math.max(0, maxC - 1));
      if (i === 0) return plain.slice(Math.max(0, minC - 1));
      if (i === maxLine - minLine) return plain.slice(0, Math.max(0, maxC - 1));
      return plain;
    }).join("\n").trimEnd();

    if (text) {
      const ok = copyToClipboard(text);
      statusMessage = ok
        ? `Copied ${maxLine - minLine + 1} line${maxLine - minLine > 0 ? "s" : ""} to clipboard`
        : "Copy failed — pbcopy/xclip not found";
      setTimeout(() => { statusMessage = ""; scheduleRefresh(); }, 2000);
    }
    selStartLine = -1; selStartCol = -1; selEndLine = -1; selEndCol = -1;
    mouseDown = false;
    scheduleRefresh();
    return true;
  }

  function resolveToolTargetAt(row: number): { messageIndex: number; resultIndex: number } | undefined {
    const state = chatTerminal.store.getState();
    const lines = renderVirtualLines(state, W());
    const clickedLineIndex = visStartLine + row - 1;
    const line = stripAnsi(lines.getLine(clickedLineIndex));
    const match = line.match(/^\s*⎿ (.+?)(?: [✓✗])?$/);
    if (!match) return undefined;
    const clickedToolName = match[1];

    let occurrence = 0;
    for (let index = 0; index <= clickedLineIndex; index += 1) {
      const renderedMatch = stripAnsi(lines.getLine(index)).match(/^\s*⎿ (.+?)(?: [✓✗])?$/);
      if (renderedMatch?.[1] === clickedToolName) occurrence += 1;
    }

    const messages = state.messages;
    for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
      const msg = messages[messageIndex];
      if (msg?.role !== "tool" || !msg.toolResults?.length) continue;
      for (let resultIndex = 0; resultIndex < msg.toolResults.length; resultIndex += 1) {
        if (msg.toolResults[resultIndex]?.name !== clickedToolName) continue;
        occurrence -= 1;
        if (occurrence === 0) return { messageIndex, resultIndex };
      }
    }
    return undefined;
  }

  function toggleResultAt(row: number): boolean {
    const target = resolveToolTargetAt(row);
    if (!target) return false;
    const messages = chatTerminal.store.getState().messages;
    const next = messages.map((message, index) => {
      if (index !== target.messageIndex || message.role !== "tool") return message;
      return { ...message, expandedResultIndex: message.expandedResultIndex === target.resultIndex ? undefined : target.resultIndex };
    });
    focusedToolTarget = target;
    chatTerminal.store.dispatch({ messages: next });
    scheduleRefresh();
    return true;
  }

  function openCurrentMessageViewer(): boolean {
    const messages = chatTerminal.store.getState().messages;
    const messageIndex = currentMessageIndex();
    const msg = messages[messageIndex];
    if (!msg) return false;
    viewMode = { messageIndex, scroll: 0 };
    prevScreenLines = [];
    scheduleRefresh(true);
    return true;
  }

  function onInput(data: string): void {
    if (viewMode) {
      if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("o"))) {
        viewMode = undefined;
        prevScreenLines = [];
        scheduleRefresh(true);
        return;
      }
      const page = Math.max(1, R() - 1);
      const total = renderViewModeVirtualLines(chatTerminal.store.getState(), W()).total;
      const maxScroll = Math.max(0, total - R());
      const scrollViewBy = (delta: number) => {
        viewMode!.scroll = Math.max(0, Math.min(maxScroll, viewMode!.scroll + delta));
        scheduleRefresh(true);
      };
      if (matchesKey(data, Key.up)) { scrollViewBy(-1); return; }
      if (matchesKey(data, Key.down)) { scrollViewBy(1); return; }
      if (data === "\x1b[5~") { scrollViewBy(-page); return; }
      if (data === "\x1b[6~") { scrollViewBy(page); return; }

      const sgrPress = data.match(/^\x1b\[<(\d+);(\d+);(\d+)M$/);
      if (sgrPress) {
        const btn = Number(sgrPress[1]);
        if (btn === 64) { scrollViewBy(-SCROLL_SPEED); return; }
        if (btn === 65) { scrollViewBy(SCROLL_SPEED); return; }
      }
      if (data.startsWith("\x1b[M") && data.length >= 6) {
        const btn = data.charCodeAt(3) - 32;
        if (btn === 64) { scrollViewBy(-SCROLL_SPEED); return; }
        if (btn === 65) { scrollViewBy(SCROLL_SPEED); return; }
      }
      if (/^\x1b\[<64;/.test(data)) { scrollViewBy(-SCROLL_SPEED); return; }
      if (/^\x1b\[<65;/.test(data)) { scrollViewBy(SCROLL_SPEED); return; }
      return;
    }

    if (matchesKey(data, Key.ctrl("o"))) {
      if (!openCurrentMessageViewer()) {
        statusMessage = "No message to open";
        setTimeout(() => { statusMessage = ""; scheduleRefresh(); }, 2000);
      }
      return;
    }

    // ── mouse events ────────────────────────────────────────────────────────
    // SGR mouse: \x1b[<Cb;Cx;CyM (press/move) or \x1b[<Cb;Cx;Cym (release)
    const sgrPress   = data.match(/^\x1b\[<(\d+);(\d+);(\d+)M$/);
    const sgrRelease = data.match(/^\x1b\[<(\d+);(\d+);(\d+)m$/);

    if (sgrPress) {
      const [, btn, col, row] = sgrPress.map(Number);
      if (btn === 0) {
        // Left button down — set anchor, start new selection (content-space).
        // Copying selected text is intentionally limited to Ctrl+C so
        // double-click can remain available for normal text selection behavior.
        const clickLine = visStartLine + (row! - 1);
        const now = Date.now();
        const isDoubleClick = now - lastClickAt <= 500 &&
          clickLine === lastClickLine &&
          Math.abs(col! - lastClickCol) <= 1;
        lastClickAt = now;
        lastClickLine = clickLine;
        lastClickCol = col!;

        if (isDoubleClick && selectTokenAt(clickLine, col!)) {
          mouseDown = false;
          suppressReleaseSelection = true;
          return;
        }

        mouseDown = true;
        suppressReleaseSelection = false;
        anchorLine = clickLine; anchorCol = col!;
        selStartLine = anchorLine; selStartCol = col!;
        selEndLine   = anchorLine; selEndCol   = col!;
        if (statusMessage.startsWith("Selection")) statusMessage = "";
        scheduleRefresh();
        return;
      }
      if (btn === 4) {
        // Shift+Left click — extend selection from anchor to here
        if (anchorLine >= 0) {
          selStartLine = anchorLine; selStartCol = anchorCol;
          selEndLine   = visStartLine + (row! - 1); selEndCol = col!;
          statusMessage = "Selection active · Ctrl+C to copy · Esc to clear";
          scheduleRefresh();
        }
        return;
      }
      if (btn === 32) {
        // Drag (move with left button held) — update selection end
        if (mouseDown && !suppressReleaseSelection) { selEndLine = visStartLine + (row! - 1); selEndCol = col!; scheduleRefresh(); }
        return;
      }
      // Scroll
      if (btn === 64) { doScrollUp(SCROLL_SPEED, "wheel"); return; }
      if (btn === 65) { doScrollDown(SCROLL_SPEED, "wheel"); return; }
    }

    if (sgrRelease) {
      const [, btn, col, row] = sgrRelease.map(Number);
      if (btn === 0) {
        // Left button up — end selection (keep highlight, copy happens on Ctrl+C)
        if (suppressReleaseSelection) {
          suppressReleaseSelection = false;
          return;
        }
        if (mouseDown) {
          const releaseLine = visStartLine + (row! - 1);
          selEndLine = releaseLine; selEndCol = col!;
          mouseDown = false;
          if (selStartLine === selEndLine && selStartCol === selEndCol) {
            // Single click (no drag): keep anchor, clear selection, toggle result.
            selStartLine = -1; selStartCol = -1; selEndLine = -1; selEndCol = -1;
            anchorLine = releaseLine; anchorCol = col!;
            statusMessage = "";
            toggleResultAt(row!);
          } else {
            // Drag ended — show copy hint in status bar.
            statusMessage = "Selection active · Ctrl+C to copy · Esc to clear";
          }
          scheduleRefresh();
        }
        return;
      }
    }

    // X10 mouse scroll fallback
    if (data.startsWith("\x1b[M") && data.length >= 6) {
      const btn = data.charCodeAt(3) - 32;
      if (btn === 64) { doScrollUp(SCROLL_SPEED, "wheel"); return; }
      if (btn === 65) { doScrollDown(SCROLL_SPEED, "wheel"); return; }
    }

    // Mouse scroll: SGR encoding (duplicate guard — sgrPress above handles most cases).
    if (/^\x1b\[<64;/.test(data)) { doScrollUp(SCROLL_SPEED, "wheel"); return; }
    if (/^\x1b\[<65;/.test(data)) { doScrollDown(SCROLL_SPEED, "wheel"); return; }
    // PgUp / PgDn.
    if (data === "\x1b[5~") { doScrollUp(Math.max(1, R() - currentBottomHeight - borderRows() - 1), "page"); return; }
    if (data === "\x1b[6~") { doScrollDown(Math.max(1, R() - currentBottomHeight - borderRows() - 1), "page"); return; }

    const state = chatTerminal.store.getState();

    // Ctrl+T: toggle copy mode.
    if (matchesKey(data, Key.ctrl("t"))) {
      copyMode = !copyMode;
      prevScreenLines = []; // copy mode uses different rendering path
      process.stdout.write(copyMode ? DISABLE_MOUSE_TRACKING : ENABLE_MOUSE_TRACKING);
      scheduleRefresh();
      return;
    }

    if (matchesKey(data, Key.ctrl("c"))) {
      // If text is selected and no task is running: copy to clipboard (like Claude Code).
      const stateNow = chatTerminal.store.getState();
      if (hasActiveSelection() && !stateNow.input.busy) {
        copyActiveSelection(stateNow);
        return;
      }
      handleInterrupt();
      return;
    }

    // Escape clears active selection
    if (matchesKey(data, Key.escape) && selStartLine >= 0) {
      selStartLine = -1; selStartCol = -1; selEndLine = -1; selEndCol = -1;
      anchorLine = -1; anchorCol = -1; mouseDown = false; suppressReleaseSelection = false;
      statusMessage = "";
      scheduleRefresh();
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
    prevScreenLines = []; // force full redraw after resize
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
