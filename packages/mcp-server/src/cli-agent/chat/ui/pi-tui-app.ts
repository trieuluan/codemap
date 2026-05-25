import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  ProcessTerminal,
  TUI,
  type Component,
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
  RESET,
  SPINNER,
} from "./pi-tui/theme.js";
import { workspaceStateCardLines } from "./pi-tui/text.js";
import {
  buildPanel,
  isActiveTaskPhase,
} from "./pi-tui/panel-builder.js";
import { getMastraMessages } from "../runtime/mastra-harness-runtime.js";

export { isActiveTaskPhase };

const EXIT_CONFIRM_WINDOW_MS = 2000;

// ── Tool result inline toggle (Ctrl+O) ───────────────────────────────────────

function extractToolResultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result
      .map((r) => {
        if (typeof r === "string") return r;
        if (typeof r === "object" && r !== null && "text" in r)
          return String((r as Record<string, unknown>).text);
        return JSON.stringify(r, null, 2);
      })
      .join("\n");
  }
  return JSON.stringify(result, null, 2);
}

async function toggleAllToolCallsExpanded(chatTerminal: ChatTerminal): Promise<void> {
  const state = chatTerminal.store.getState();
  const messages = state.messages;

  // Collect all tool_call message indices
  const toolCallIdxs: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "tool_call") toolCallIdxs.push(i);
  }

  if (toolCallIdxs.length === 0) {
    chatTerminal.store.dispatch((prev) => ({
      messages: [...prev.messages, { role: "system" as const, content: "No tool call to expand yet.", timestamp: Date.now() }],
    }));
    return;
  }

  // If any are expanded → collapse all; otherwise → expand all
  const anyExpanded = toolCallIdxs.some((i) => messages[i]!.expanded);

  if (anyExpanded) {
    chatTerminal.store.dispatch((prev) => {
      const msgs = [...prev.messages];
      for (const idx of toolCallIdxs) {
        msgs[idx] = { ...msgs[idx]!, expanded: false };
      }
      return { messages: msgs };
    });
    return;
  }

  // Expand all — fetch content for any that don't have expandedContent yet
  const needsFetch = toolCallIdxs.filter((i) => !messages[i]!.expandedContent);
  let fetchedResults: Map<number, string> = new Map();

  if (needsFetch.length > 0) {
    try {
      const threadMessages = await getMastraMessages(300);
      // Collect all tool_result contents from thread history
      const allResults: string[] = [];
      for (const m of threadMessages) {
        if (!m) continue;
        for (const block of m.content) {
          if (block.type === "tool_result") {
            allResults.push(extractToolResultText((block as Record<string, unknown>).result));
          }
        }
      }
      // Assign results to needsFetch indices (most recent results map to most recent tool_calls)
      for (let j = 0; j < needsFetch.length && j < allResults.length; j++) {
        const result = allResults[allResults.length - 1 - j];
        const msgIdx = needsFetch[needsFetch.length - 1 - j]!;
        if (result?.trim()) fetchedResults.set(msgIdx, result);
      }
    } catch {
      // fall through
    }
  }

  chatTerminal.store.dispatch((prev) => {
    const msgs = [...prev.messages];
    for (const idx of toolCallIdxs) {
      const existing = msgs[idx]!;
      const latestResult = existing.toolResults?.at(-1);
      const fetched = fetchedResults.get(idx);
      if (existing.expandedContent) {
        msgs[idx] = { ...existing, expanded: true };
      } else if (latestResult?.fullContent || latestResult?.content) {
        msgs[idx] = {
          ...existing,
          expanded: true,
          expandedContent: latestResult.fullContent ?? latestResult.content,
        };
      } else if (fetched) {
        msgs[idx] = { ...existing, expanded: true, expandedContent: fetched };
      } else {
        msgs[idx] = { ...existing, expanded: true };
      }
    }
    return { messages: msgs };
  });
}

export async function startPiTuiApp(chatTerminal: ChatTerminal): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal, true);

  // ── app state ─────────────────────────────────────────────────────────────
  let stopped = false;
  let shellMode = false;
  let debugMode = false;
  let planMode = false;
  let frame = 0;
  let lastExitConfirmAt = 0;
  let exitConfirmTimer: NodeJS.Timeout | undefined;
  let statusMessage = "";
  let tick: NodeJS.Timeout | undefined;
  let unsubscribe: (() => void) | undefined;
  const pendingImages: PastedImage[] = [];

  // ── message render cache ──────────────────────────────────────────────────
  type MessageBlock = {
    signature: string;
    contentRef: string;
    lines: string[];
  };

  let _cachedBlocks: MessageBlock[] = [];
  let _cachedChromeLines: string[] = [];
  let _cachedWidth = -1;
  let _cachedChromeSignature = "";
  let _cachedMessageCount = 0;

  function messageRenderSignature(
    msg: ReturnType<typeof chatTerminal.store.getState>["messages"][number],
    idx: number,
    spinning: boolean,
  ): string {
    return [
      idx,
      msg.role,
      msg.name ?? "",
      msg.expanded ? "1" : "0",
      msg.expandedResultIndex ?? "",
      chatTerminal.store.getState().config.debug ? "debug" : "",
      msg.toolCalls?.length ?? 0,
      msg.toolResults?.length ?? 0,
      spinning && msg.role === "tool_call" && !msg.toolResults?.length ? frame : "",
    ].join(":");
  }

  function chromeRenderSignature(state: ReturnType<typeof chatTerminal.store.getState>): string {
    return JSON.stringify([state.chatMode, state.workspaceState]);
  }

  function renderMessageLines(state: ReturnType<typeof chatTerminal.store.getState>, w: number): string[] {
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

    const nextBlocks: MessageBlock[] = _cachedBlocks.slice(0, firstDirty);

    for (let idx = firstDirty; idx < state.messages.length; idx += 1) {
      const msg = state.messages[idx];
      if (!msg) continue;
      const signature = messageRenderSignature(msg, idx, spinning);
      const prev = !widthChanged ? _cachedBlocks[idx] : undefined;
      const lines = (prev?.signature === signature && prev.contentRef === msg.content)
        ? prev.lines
        : messageLines([msg], contentWidth, frame, {
          showRawToolData: state.config.debug,
        });
      nextBlocks[idx] = { signature, contentRef: msg.content, lines };
    }

    _cachedBlocks = nextBlocks;
    _cachedWidth = w;
    _cachedMessageCount = state.messages.length;

    const out: string[] = [..._cachedChromeLines];
    for (const block of _cachedBlocks) {
      if (block) out.push(...block.lines);
    }
    return out;
  }

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

  const editor = new Editor(tui, editorTheme);
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
    const imageFiles = pendingImages.map((img) => ({ data: img.data, mimeType: img.mimeType }));
    pendingImages.length = 0;
    chatTerminal.store.dispatch((prev) => ({
      input: { ...prev.input, history: [...prev.input.history, trimmed] },
    }));
    editor.addToHistory(trimmed);
    editor.setText("");
    shellMode = false;
    void chatTerminal.handleSubmitWithContent(trimmed, false, imageFiles.length > 0 ? imageFiles : undefined);
  };

  // ── TUI components ────────────────────────────────────────────────────────

  class MessagesComponent implements Component {
    invalidate(): void { _cachedWidth = -1; }
    render(width: number): string[] {
      return renderMessageLines(chatTerminal.store.getState(), width);
    }
  }

  class PanelComponent implements Component {
    invalidate(): void {}
    render(width: number): string[] {
      const state = chatTerminal.store.getState();
      debugMode = state.debug;
      planMode = state.planMode;
      const result = buildPanel(state, width, {
        editor, frame, shellMode, debugMode, statusMessage,
      });
      return result.lines;
    }
  }

  tui.addChild(new MessagesComponent());
  tui.addChild(new PanelComponent());
  tui.setFocus(editor);

  // ── helpers ───────────────────────────────────────────────────────────────

  function clearExitConfirm(): void {
    lastExitConfirmAt = 0;
    statusMessage = "";
    if (exitConfirmTimer) {
      clearTimeout(exitConfirmTimer);
      exitConfirmTimer = undefined;
    }
  }

  function handleInterrupt(): void {
    const state = chatTerminal.store.getState();
    if (editor.getText().length > 0) {
      editor.setText("");
      shellMode = false;
      clearExitConfirm();
      tui.requestRender();
      return;
    }
    if (state.input.busy) {
      const canceledPrompt = chatTerminal.cancelTask();
      if (canceledPrompt) {
        editor.setText(canceledPrompt);
        shellMode = canceledPrompt.startsWith("!");
      }
      clearExitConfirm();
      tui.requestRender();
      return;
    }
    if (state.planMode) {
      chatTerminal.store.dispatch({ planMode: false });
      clearExitConfirm();
      tui.requestRender();
      return;
    }
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
      tui.requestRender();
    }, EXIT_CONFIRM_WINDOW_MS);
    tui.requestRender();
  }

  async function handleEditorInput(data: string): Promise<void> {
    try {
      const image = await imageFromPaste(data);
      if (image) {
        pendingImages.push(image);
        const current = editor.getText();
        editor.setText(current ? `${current} ${image.marker}` : image.marker);
        tui.requestRender();
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
      tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      const lines = editor.getLines();
      const { line, col } = editor.getCursor();
      const textBeforeCursor = (lines[line] ?? "").slice(0, col);
      const markerMatch = textBeforeCursor.match(/\[image:[^\]]+\]$/);
      if (markerMatch) {
        const marker = markerMatch[0]!;
        const fullText = lines.join("\n");
        editor.setText(fullText.slice(0, fullText.lastIndexOf(marker)) + fullText.slice(fullText.lastIndexOf(marker) + marker.length));
        for (let i = pendingImages.length - 1; i >= 0; i--) {
          if (pendingImages[i]!.marker === marker) { pendingImages.splice(i, 1); break; }
        }
        tui.requestRender();
        return;
      }
    }

    editor.handleInput(data);
    const currentText = editor.getText();
    for (let i = pendingImages.length - 1; i >= 0; i--) {
      if (!currentText.includes(pendingImages[i]!.marker)) pendingImages.splice(i, 1);
    }
    shellMode = currentText.startsWith("!");
    tui.requestRender();
  }

  // ── input handling ────────────────────────────────────────────────────────

  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      handleInterrupt();
      return { consume: true };
    }

    const state = chatTerminal.store.getState();

    if (matchesKey(data, Key.escape) && state.screen === "help") {
      chatTerminal.store.dispatch({ screen: "main" });
      tui.requestRender();
      return { consume: true };
    }

    // Ctrl+O — open last tool result in pager
    if (matchesKey(data, Key.ctrl("o"))) {
      void toggleAllToolCallsExpanded(chatTerminal);
      return { consume: true };
    }

    // Plan review inline select (only when editor is empty).
    if (state.planReview?.active && editor.getText().trim() === "") {
      const PLAN_OPTIONS = ["implement", "no"] as const;
      const sel = state.planReview.selection ?? 0;
      if (matchesKey(data, Key.up)) {
        chatTerminal.store.dispatch({ planReview: { active: true, selection: (sel + PLAN_OPTIONS.length - 1) % PLAN_OPTIONS.length } });
        tui.requestRender();
        return { consume: true };
      }
      if (matchesKey(data, Key.down)) {
        chatTerminal.store.dispatch({ planReview: { active: true, selection: (sel + 1) % PLAN_OPTIONS.length } });
        tui.requestRender();
        return { consume: true };
      }
      if (matchesKey(data, Key.enter)) {
        chatTerminal.resolvePlanReview(PLAN_OPTIONS[sel] ?? "implement");
        return { consume: true };
      }
      if (matchesKey(data, Key.escape)) {
        chatTerminal.resolvePlanReview("cancel");
        return { consume: true };
      }
    }

    // All other input → async editor handler (image paste detection + editor routing).
    void handleEditorInput(data);
    return { consume: true };
  });

  // ── lifecycle ─────────────────────────────────────────────────────────────

  function cleanup(): void {
    if (stopped) return;
    stopped = true;
    if (exitConfirmTimer) { clearTimeout(exitConfirmTimer); exitConfirmTimer = undefined; }
    if (tick) { clearInterval(tick); tick = undefined; }
    unsubscribe?.();
    process.off("SIGINT", handleInterrupt);
    tui.stop();
  }

  process.once("exit", cleanup);
  process.once("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", handleInterrupt);

  await initShiki().catch(() => {});

  tui.start();

  // ── spinner tick ──────────────────────────────────────────────────────────

  tick = setInterval(() => {
    const state = chatTerminal.store.getState();
    if (isActiveTaskPhase(state.task.phase) || state.synthRunning) {
      frame = (frame + 1) % SPINNER.length;
      tui.requestRender();
    }
  }, 120);

  // ── store subscription ────────────────────────────────────────────────────

  let _lastMessageCount = 0;
  unsubscribe = chatTerminal.bus.on("screen:refresh", () => {
    const count = chatTerminal.store.getState().messages.length;
    if (count !== _lastMessageCount) {
      _lastMessageCount = count;
      tui.requestRender(true);
    } else {
      tui.requestRender();
    }
  });

  // ── wait for stop ─────────────────────────────────────────────────────────

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (stopped) { clearInterval(interval); resolve(); }
    }, 50);
  });
}
