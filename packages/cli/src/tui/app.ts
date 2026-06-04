import {
  Editor,
  type EditorTheme,
  Key,
  matchesKey,
  ProcessTerminal,
  TUI,
  type Component,
} from "@earendil-works/pi-tui";
import type { UIState } from "../chat/state/store.js";
import type { ChatTerminalLike } from "../chat/terminal/ui/types.js";
import { headerLines, messageLines } from "./renderer/message-renderer.js";
import {
  MentionAutocompleteProvider,
  ModelPickerProvider,
  SessionPickerProvider,
  flattenTreeForPicker,
} from "./input/input.js";
import { getCommandList } from "../chat/slash-commands/index.js";
import { initShiki } from "./renderer/shiki-highlight.js";
import { imageFromPaste, type PastedImage } from "./input/image-paste.js";
import {
  C_CYAN,
  C_ERROR,
  C_GRAY,
  C_GREEN,
  C_PURPLE,
  C_RED,
  C_SUCCESS,
  RESET,
  SPINNER,
} from "./theme.js";
import { workspaceStateCardLines } from "./text/text.js";
import { buildPanel, isActiveTaskPhase } from "./renderer/panel-builder.js";
import { getMastraMessages, getMastraThreadId, listMastraThreads, switchMastraThread, getMastraThreadTree, getMastraActiveLeafId, branchMastraThread, forkMastraThread } from "../agent/runtime/harness-runtime.js";
import { sortThreads } from "../chat/slash-commands/sessions.js";
import { formatTime } from "./renderer/ink-utils.js";

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

async function toggleAllToolCallsExpanded(
  chatTerminal: ChatTerminalLike,
): Promise<void> {
  const state = chatTerminal.store.getState();
  const messages = state.messages;

  // Collect all tool_call message indices
  const toolCallIdxs: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === "tool_call") toolCallIdxs.push(i);
  }

  if (toolCallIdxs.length === 0) {
    chatTerminal.store.dispatch((prev: UIState) => ({
      messages: [
        ...prev.messages,
        {
          role: "system" as const,
          content: "No tool call to expand yet.",
          timestamp: Date.now(),
        },
      ],
    }));
    return;
  }

  // If any are expanded → collapse all; otherwise → expand all
  const anyExpanded = toolCallIdxs.some((i) => messages[i]!.expanded);

  if (anyExpanded) {
    chatTerminal.store.dispatch((prev: UIState) => {
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
            allResults.push(
              extractToolResultText((block as Record<string, unknown>).result),
            );
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

  chatTerminal.store.dispatch((prev: UIState) => {
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

export async function startPiTuiApp(
  chatTerminal: ChatTerminalLike,
): Promise<void> {
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
    suppressInitialTimestamp: boolean,
  ): string {
    // NOTE: frame is intentionally excluded from the signature.
    // Including it would invalidate the cache every 120ms (spinner tick),
    // causing full message re-renders that may change line count and
    // trigger pi-tui's fullRender() → scroll jump.  Instead, we patch
    // only the spinner character on cached lines (see patchSpinnerLines).
    return [
      idx,
      msg.role,
      msg.timestamp,
      suppressInitialTimestamp ? "suppress-time" : "show-time",
      msg.name ?? "",
      msg.expanded ? "1" : "0",
      msg.expandedResultIndex ?? "",
      chatTerminal.store.getState().config.debug ? "debug" : "",
      chatTerminal.store.getState().previewDiffExpanded ? "diff-x" : "",
      msg.toolCalls?.length ?? 0,
      msg.toolResults?.length ?? 0,
    ].join(":");
  }

  function chromeRenderSignature(
    state: ReturnType<typeof chatTerminal.store.getState>,
  ): string {
    return JSON.stringify([state.chatMode, state.workspaceState]);
  }

  function renderMessageLines(
    state: ReturnType<typeof chatTerminal.store.getState>,
    w: number,
  ): string[] {
    const contentWidth = w - 2;
    const widthChanged = w !== _cachedWidth;
    const chromeSignature = chromeRenderSignature(state);

    const chromeChanged = chromeSignature !== _cachedChromeSignature;
    if (widthChanged || chromeChanged) {
      _cachedChromeLines = [
        ...headerLines(state),
        ...workspaceStateCardLines(
          state.workspaceState,
          state.chatMode,
          contentWidth,
        ),
      ];
      _cachedChromeSignature = chromeSignature;
    }

    let firstDirty = 0;
    if (
      !widthChanged &&
      !chromeChanged &&
      _cachedMessageCount === state.messages.length
    ) {
      firstDirty = state.messages.length;
      for (let idx = 0; idx < state.messages.length; idx += 1) {
        const msg = state.messages[idx];
        const prev = _cachedBlocks[idx];
        if (!msg || !prev) {
          firstDirty = idx;
          break;
        }
        const prevMsg = state.messages[idx - 1];
        const suppressInitialTimestamp =
          !!prevMsg && formatTime(prevMsg.timestamp) === formatTime(msg.timestamp);
        const signature = messageRenderSignature(msg, idx, suppressInitialTimestamp);
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
      const prevMsg = state.messages[idx - 1];
      const suppressInitialTimestamp =
        !!prevMsg && formatTime(prevMsg.timestamp) === formatTime(msg.timestamp);
      const signature = messageRenderSignature(msg, idx, suppressInitialTimestamp);
      const prev = !widthChanged ? _cachedBlocks[idx] : undefined;
      const lines =
        prev?.signature === signature && prev.contentRef === msg.content
          ? prev.lines
          : messageLines([msg], contentWidth, frame, {
              showRawToolData: state.config.debug,
              suppressFirstTimestamp: suppressInitialTimestamp,
              previewDiffExpanded: state.previewDiffExpanded,
            });
      nextBlocks[idx] = { signature, contentRef: msg.content, lines };
    }

    _cachedBlocks = nextBlocks;
    _cachedWidth = w;
    _cachedMessageCount = state.messages.length;

    // Return cached lines directly without patching spinner characters.
    // Patching caused character-level diffs above the viewport, which pi-tui
    // detects as `firstChanged < prevViewportTop` and triggers fullRender(true)
    // → clear screen + clear scrollback → scroll jump.
    // The PanelComponent renders its own spinner at the bottom (within viewport),
    // so the spinner still animates there via differential rendering.
    const out: string[] = [];
    for (const line of _cachedChromeLines) {
      out.push(line);
    }
    for (const block of _cachedBlocks) {
      if (block) {
        out.push(...block.lines);
      }
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
    {
      value: "/plan",
      description: "Plan then implement: planner → coder → reviewer",
    },
    ...getCommandList().map((c) => ({
      value: `/${c.name}`,
      description: c.description,
    })),
  ].sort((a, b) => a.value.localeCompare(b.value));
  const defaultAutocompleteProvider = new MentionAutocompleteProvider({
    commands: slashCommands,
  });
  let modelPickerActive = false;

  const switchModel = (model: string) => {
    const prev = chatTerminal.store.getState();
    chatTerminal.store.dispatch((s: UIState) => ({ config: { ...s.config, model } }));
    chatTerminal.store.dispatch((s: UIState) => ({
      messages: [
        ...s.messages,
        {
          role: "system" as const,
          content: `Switched model: ${prev.config.model} → ${model}`,
        },
      ],
    }));
  };

  const closeModelPicker = () => {
    if (!modelPickerActive) return;
    modelPickerActive = false;
    editor.setAutocompleteProvider(defaultAutocompleteProvider);
    editor.setText("");
  };

  const openModelPicker = () => {
    const state = chatTerminal.store.getState();
    if (state.config.availableModels.length === 0) return;
    modelPickerActive = true;
    editor.setText("");
    editor.setAutocompleteProvider(
      new ModelPickerProvider(
        () => chatTerminal.store.getState().config.availableModels,
        () => chatTerminal.store.getState().config.model,
        switchModel,
        closeModelPicker,
      ),
    );
    editor.handleInput("\t");
  };

  // ── Session/thread picker ─────────────────────────────────────────────────

  let sessionPickerActive = false;
  let sessionThreads: import("../agent/runtime/events.js").HarnessThread[] = [];

  const closeSessionPicker = () => {
    if (!sessionPickerActive) return;
    sessionPickerActive = false;
    editor.setAutocompleteProvider(defaultAutocompleteProvider);
    editor.setText("");
  };

  const openSessionPicker = async () => {
    const threads = await listMastraThreads();
    if (threads.length === 0) {
      chatTerminal.store.dispatch((prev: UIState) => ({
        messages: [
          ...prev.messages,
          { role: "system" as const, content: "No saved threads yet.", timestamp: Date.now() },
        ],
      }));
      return;
    }
    sessionThreads = sortThreads(threads);
    sessionPickerActive = true;
    editor.setText("");
    editor.setAutocompleteProvider(
      new SessionPickerProvider(
        () => sessionThreads,
        () => getMastraThreadId(),
        async (threadId: string) => {
          const ok = await switchMastraThread(threadId);
          if (!ok) {
            chatTerminal.store.dispatch((prev: UIState) => ({
              messages: [
                ...prev.messages,
                { role: "system" as const, content: `Failed to switch to thread \`${threadId.slice(0, 8)}\`.`, timestamp: Date.now() },
              ],
            }));
            return;
          }
          const { mapHarnessMessagesToUI } = await import("../chat/slash-commands/sessions.js");
          const { listMastraThreadMessages } = await import("../agent/runtime/harness-runtime.js");
          const msgs = await listMastraThreadMessages(threadId, 100);
          chatTerminal.store.dispatch((prev: UIState) => ({
            messages: mapHarnessMessagesToUI(msgs),
            sessionTokens: 0,
          }));
          chatTerminal.bus.scheduleRefresh();
          chatTerminal.store.dispatch((prev: UIState) => ({
            messages: [
              ...prev.messages,
              { role: "system" as const, content: `Switched to thread \`${threadId.slice(0, 8)}\`.`, timestamp: Date.now() },
            ],
          }));
        },
        closeSessionPicker,
      ),
    );
    editor.handleInput("\t");
  };

  // ── Tree picker (fullscreen pi.dev-style) ───────────────────────────────

  let treePickerActive = false;

  /** Collect harnessMessageIds on the active path (root → leaf) from TreeNode[]. */
  function collectActivePathIds(nodes: import("../chat/session-tree.js").TreeNode[]): Set<string> {
    const ids = new Set<string>();
    const walk = (n: import("../chat/session-tree.js").TreeNode) => {
      if (n.isActive) {
        if (n.entry.harnessMessageId) ids.add(n.entry.harnessMessageId);
        n.children.forEach(walk);
      }
    };
    nodes.forEach(walk);
    return ids;
  }

  const closeTreePicker = () => {
    if (!treePickerActive) return;
    treePickerActive = false;
    chatTerminal.store.dispatch((prev: UIState) => ({
      treePicker: null,
    }));
  };

  const openTreePicker = async (mode: "branch" | "fork" = "branch") => {
    const nodes = await getMastraThreadTree();
    if (!nodes) {
      chatTerminal.store.dispatch((prev: UIState) => ({
        messages: [
          ...prev.messages,
          { role: "system" as const, content: "No tree data for current thread.", timestamp: Date.now() },
        ],
      }));
      return;
    }
    const activeLeafId = await getMastraActiveLeafId();
    // Fork mode: filter to user-only (filterMode=2)
    const filterMode = mode === "fork" ? 2 : 0;
    const items = flattenTreeForPicker(nodes, filterMode, new Set());
    if (items.length === 0) {
      chatTerminal.store.dispatch((prev: UIState) => ({
        messages: [
          ...prev.messages,
          { role: "system" as const, content: mode === "fork" ? "No user messages to fork from." : "Empty tree — nothing to navigate.", timestamp: Date.now() },
        ],
      }));
      return;
    }
    // Find the active leaf index to pre-select it
    let selIdx = items.findIndex((i) => i.isLeaf);
    if (selIdx < 0) selIdx = 0;

    treePickerActive = true;
    chatTerminal.store.dispatch((prev: UIState) => ({
      treePicker: {
        active: true,
        mode,
        items,
        selectedIndex: selIdx,
        foldedIds: new Set<string>(),
        filterMode,
        activeLeafId: activeLeafId ?? null,
      },
    }));
  };

  editor.setAutocompleteProvider(defaultAutocompleteProvider);
  editor.onChange = (text) => {
    // Selecting /models from slash autocomplete via Tab leaves a trailing
    // space in input; immediately replace it with the inline picker.
    if (!modelPickerActive && /^\/models?\s$/i.test(text)) {
      openModelPicker();
    }
    if (!sessionPickerActive && /^\/sessions?\s$/i.test(text)) {
      void openSessionPicker();
    }
    if (!treePickerActive && /^\/tree\s$/i.test(text)) {
      void openTreePicker();
    }
    if (!treePickerActive && /^\/fork\s$/i.test(text)) {
      void openTreePicker("fork");
    }
  };

  editor.onSubmit = (value) => {
    const trimmed = value.trim();
    const state = chatTerminal.store.getState();

    // Plan review: only allow text submission when in revise mode.
    if (state.planReview?.active && trimmed) {
      if (state.planReview.reviseMode) {
        editor.setText("");
        chatTerminal.resolvePlanReview(`revise: ${trimmed}`);
        return;
      }
      // Not in revise mode — block text input.
      return;
    }

    // ask_user free-text answer (only when there are no selection options).
    if (
      state.askQuestion?.active &&
      trimmed &&
      !state.askQuestion.options?.length
    ) {
      editor.setText("");
      chatTerminal.resolveAskQuestion(trimmed);
      return;
    }

    if (!trimmed || state.input.busy) return;

    // Picker commands open inline overlays and clear/hide the input text.
    if (/^\/models?$/i.test(trimmed)) {
      openModelPicker();
      return;
    }
    if (/^\/sessions?$/i.test(trimmed)) {
      void openSessionPicker();
      return;
    }
    if (/^\/tree$/i.test(trimmed)) {
      void openTreePicker();
      return;
    }
    if (/^\/fork$/i.test(trimmed)) {
      void openTreePicker("fork");
      return;
    }
    const imageFiles = pendingImages.map((img) => ({
      data: img.data,
      mimeType: img.mimeType,
    }));
    pendingImages.length = 0;
    chatTerminal.store.dispatch((prev: UIState) => ({
      input: { ...prev.input, history: [...prev.input.history, trimmed] },
    }));
    editor.addToHistory(trimmed);
    editor.setText("");
    shellMode = false;
    void chatTerminal.handleSubmitWithContent(
      trimmed,
      false,
      imageFiles.length > 0 ? imageFiles : undefined,
    );
  };

  // ── TUI components ────────────────────────────────────────────────────────

  class MessagesComponent implements Component {
    invalidate(): void {
      _cachedWidth = -1;
    }
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
        editor,
        frame,
        shellMode,
        debugMode,
        statusMessage,
        modelPickerActive,
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
      chatTerminal.store.dispatch((prev: UIState) => ({
        messages: [
          ...prev.messages,
          {
            role: "system",
            content: `Image paste skipped: ${message}`,
            timestamp: Date.now(),
          },
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
        editor.setText(
          fullText.slice(0, fullText.lastIndexOf(marker)) +
            fullText.slice(fullText.lastIndexOf(marker) + marker.length),
        );
        for (let i = pendingImages.length - 1; i >= 0; i--) {
          if (pendingImages[i]!.marker === marker) {
            pendingImages.splice(i, 1);
            break;
          }
        }
        tui.requestRender();
        return;
      }
    }

    editor.handleInput(data);
    if (matchesKey(data, Key.escape)) {
      if (modelPickerActive) {
        closeModelPicker();
      }
      if (sessionPickerActive) {
        closeSessionPicker();
      }
    }
    const currentText = editor.getText();
    for (let i = pendingImages.length - 1; i >= 0; i--) {
      if (!currentText.includes(pendingImages[i]!.marker))
        pendingImages.splice(i, 1);
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

    // Ctrl+E — toggle diff preview expand/collapse
    if (matchesKey(data, Key.ctrl("e"))) {
      chatTerminal.store.dispatch((prev: UIState) => ({
        previewDiffExpanded: !prev.previewDiffExpanded,
      }));
      tui.requestRender();
      return { consume: true };
    }

    // Ctrl+T — toggle task list widget
    if (matchesKey(data, Key.ctrl("t"))) {
      chatTerminal.store.dispatch((prev: UIState) => ({
        taskListVisible: !prev.taskListVisible,
      }));
      tui.requestRender();
      return { consume: true };
    }

    // Tree picker — fullscreen interactive session tree selector.
    if (state.treePicker?.active) {
      const tp = state.treePicker;
      const items = tp.items;
      const sel = tp.selectedIndex;
      const PAGE_SIZE = 10;

      // ↑ — navigate up
      if (matchesKey(data, Key.up)) {
        const newSel = sel > 0 ? sel - 1 : items.length - 1;
        chatTerminal.store.dispatch((prev: UIState) => ({
          treePicker: prev.treePicker ? { ...prev.treePicker, selectedIndex: newSel } : null,
        }));
        tui.requestRender();
        return { consume: true };
      }
      // ↓ — navigate down
      if (matchesKey(data, Key.down)) {
        const newSel = sel < items.length - 1 ? sel + 1 : 0;
        chatTerminal.store.dispatch((prev: UIState) => ({
          treePicker: prev.treePicker ? { ...prev.treePicker, selectedIndex: newSel } : null,
        }));
        tui.requestRender();
        return { consume: true };
      }
      // ← — page up
      if (matchesKey(data, Key.left)) {
        const newSel = Math.max(0, sel - PAGE_SIZE);
        chatTerminal.store.dispatch((prev: UIState) => ({
          treePicker: prev.treePicker ? { ...prev.treePicker, selectedIndex: newSel } : null,
        }));
        tui.requestRender();
        return { consume: true };
      }
      // → — page down
      if (matchesKey(data, Key.right)) {
        const newSel = Math.min(items.length - 1, sel + PAGE_SIZE);
        chatTerminal.store.dispatch((prev: UIState) => ({
          treePicker: prev.treePicker ? { ...prev.treePicker, selectedIndex: newSel } : null,
        }));
        tui.requestRender();
        return { consume: true };
      }
      // Ctrl+← — fold/unfold branch point
      if (matchesKey(data, Key.ctrl("left"))) {
        const item = items[sel];
        if (item && item.isBranchPoint) {
          const newFolded = new Set(tp.foldedIds);
          if (newFolded.has(item.entryId)) {
            newFolded.delete(item.entryId);
          } else {
            newFolded.add(item.entryId);
          }
          // Rebuild items with new fold state (fire-and-forget)
          void getMastraThreadTree().then((nodes) => {
            if (nodes) {
              const newItems = flattenTreeForPicker(nodes, tp.filterMode, newFolded);
              let newSelIdx = newItems.findIndex((i) => i.entryId === item.entryId);
              if (newSelIdx < 0) newSelIdx = 0;
              chatTerminal.store.dispatch((prev: UIState) => ({
                treePicker: prev.treePicker ? {
                  ...prev.treePicker,
                  items: newItems,
                  selectedIndex: newSelIdx,
                  foldedIds: newFolded,
                } : null,
              }));
              tui.requestRender();
            }
          });
        }
        tui.requestRender();
        return { consume: true };
      }
      // Ctrl+O — cycle filter mode
      if (matchesKey(data, Key.ctrl("o"))) {
        const newFilterMode = (tp.filterMode + 1) % 4;
        void getMastraThreadTree().then((nodes) => {
          if (nodes) {
            const newItems = flattenTreeForPicker(nodes, newFilterMode, tp.foldedIds);
            let newSelIdx = 0;
            const currentItem = items[sel];
            if (currentItem) {
              newSelIdx = Math.max(0, newItems.findIndex((i) => i.entryId === currentItem.entryId));
            }
            chatTerminal.store.dispatch((prev: UIState) => ({
              treePicker: prev.treePicker ? {
                ...prev.treePicker,
                items: newItems,
                selectedIndex: newSelIdx,
                filterMode: newFilterMode,
              } : null,
            }));
            tui.requestRender();
          }
        });
        tui.requestRender();
        return { consume: true };
      }
      // Enter — select entry
      if (matchesKey(data, Key.enter)) {
        const item = items[sel];
        if (!item) {
          closeTreePicker();
          return { consume: true };
        }
        const entryId = item.entryId;
        const entryType = item.type;
        const isForkMode = state.treePicker?.mode === "fork";

        if (isForkMode) {
          // Fork mode: create new session from selected user message (includes the full turn)
          forkMastraThread(entryId).then(async (newThreadId) => {
            closeTreePicker();
            // Load messages from the new thread
            const { mapHarnessMessagesToUI } = await import("../chat/slash-commands/sessions.js");
            const { listMastraThreadMessages } = await import("../agent/runtime/harness-runtime.js");
            const msgs = await listMastraThreadMessages(newThreadId, 100);
            chatTerminal.store.dispatch((prev: UIState) => ({
              messages: [
                ...mapHarnessMessagesToUI(msgs),
                { role: "system" as const, content: `${C_SUCCESS}Forked!${RESET} New session: ${C_CYAN}${newThreadId.slice(0, 8)}${RESET}. Continue from here.`, timestamp: Date.now() },
              ],
            }));
            tui.requestRender();
          }).catch(() => {
            chatTerminal.store.dispatch((prev: UIState) => ({
              messages: [
                ...prev.messages,
                { role: "system" as const, content: `${C_ERROR}Fork failed.${RESET}`, timestamp: Date.now() },
              ],
            }));
            closeTreePicker();
            tui.requestRender();
          });
        } else {
          // Branch mode: move leaf, then reload only active-path messages
          const branchTarget = entryType === "user" ? (item.parentId ?? entryId) : entryId;
          branchMastraThread(branchTarget).then(async () => {
            closeTreePicker();

            // Reload tree to get updated active path, then filter messages
            const nodes = await getMastraThreadTree();
            const { mapHarnessMessagesToUI } = await import("../chat/slash-commands/sessions.js");
            const { listMastraThreadMessages } = await import("../agent/runtime/harness-runtime.js");
            const threadId = getMastraThreadId?.();
            let uiMessages: import("../chat/state/store.js").Message[] = [];

            if (nodes && threadId) {
              const activeIds = collectActivePathIds(nodes);
              const msgs = await listMastraThreadMessages(threadId, 100);
              const filtered = msgs.filter((m) => activeIds.has(m.id));
              uiMessages = mapHarnessMessagesToUI(filtered);
            }

            if (entryType === "user") {
              const content = item.content;
              if (content) {
                editor.setText(content);
              }
              chatTerminal.store.dispatch((prev: UIState) => ({
                messages: [
                  ...uiMessages,
                  { role: "system" as const, content: `Branched before user message — edit and press Enter to create a new branch.`, timestamp: Date.now() },
                ],
              }));
            } else {
              chatTerminal.store.dispatch((prev: UIState) => ({
                messages: [
                  ...uiMessages,
                  { role: "system" as const, content: `Branched to entry \`${entryId.slice(0, 8)}\` — continue from here.`, timestamp: Date.now() },
                ],
              }));
            }
            tui.requestRender();
          }).catch(() => {
            chatTerminal.store.dispatch((prev: UIState) => ({
              messages: [
                ...prev.messages,
                { role: "system" as const, content: `Failed to branch to entry \`${entryId.slice(0, 8)}\`.`, timestamp: Date.now() },
              ],
            }));
            closeTreePicker();
            tui.requestRender();
          });
        }
        return { consume: true }
      }
      // Esc/Ctrl+C — cancel tree picker
      if (matchesKey(data, Key.escape)) {
        closeTreePicker();
        tui.requestRender();
        return { consume: true };
      }
      // Block all other input while tree picker is active
      return { consume: true };
    }

    // ask_user inline select (when options are provided, block typing like planReview).
    if (state.askQuestion?.active) {
      const aq = state.askQuestion;
      const options = aq.options ?? [];

      if (options.length > 0) {
        // Options mode: only allow navigation keys, block all typing.
        const sel = aq.selection ?? 0;
        const isMultiSelect = aq.selectionMode === "multi_select";
        if (editor.getText().trim() === "") {
          if (matchesKey(data, Key.up)) {
            chatTerminal.store.dispatch({
              askQuestion: {
                ...aq,
                selection: (sel + options.length - 1) % options.length,
              },
            });
            tui.requestRender();
            return { consume: true };
          }
          if (matchesKey(data, Key.down)) {
            chatTerminal.store.dispatch({
              askQuestion: { ...aq, selection: (sel + 1) % options.length },
            });
            tui.requestRender();
            return { consume: true };
          }
          if (isMultiSelect && data === " ") {
            const selected = aq.selected.includes(sel)
              ? aq.selected.filter((idx: number) => idx !== sel)
              : [...aq.selected, sel];
            chatTerminal.store.dispatch({ askQuestion: { ...aq, selected } });
            tui.requestRender();
            return { consume: true };
          }
          if (matchesKey(data, Key.enter)) {
            if (isMultiSelect) {
              chatTerminal.resolveAskQuestion(
                aq.selected
                  .map((idx: number) => options[idx]?.label)
                  .filter((label: string | undefined): label is string => Boolean(label)),
              );
            } else {
              const selected = options[sel];
              if (selected) chatTerminal.resolveAskQuestion(selected.label);
            }
            return { consume: true };
          }
        }
        // Block all other input when options are shown.
        if (matchesKey(data, Key.escape)) {
          chatTerminal.resolveAskQuestion(isMultiSelect ? [] : "(skipped)");
          return { consume: true };
        }
        return { consume: true };
      }

      // No options — free text mode, only intercept Escape.
      if (matchesKey(data, Key.escape)) {
        chatTerminal.resolveAskQuestion("(skipped)");
        return { consume: true };
      }
    }

    // Plan review inline select (only when editor is empty).
    if (state.planReview?.active && editor.getText().trim() === "") {
      const pr = state.planReview;

      // Revise mode: user is typing feedback — let editor handle input, only intercept Escape.
      if (pr.reviseMode) {
        if (matchesKey(data, Key.escape)) {
          // Cancel revise mode, go back to option selection.
          chatTerminal.store.dispatch({
            planReview: { active: true, selection: 2, reviseMode: false },
          });
          tui.requestRender();
          return { consume: true };
        }
        // Let all other keys fall through to the editor.
        void handleEditorInput(data);
        return { consume: true };
      }

      // Not in revise mode — block all input except navigation keys.
      // This prevents typing when plan review is active but revise mode is not selected.
      if (!pr.reviseMode) {
        // Only allow navigation keys (up, down, enter, escape)
        if (
          !matchesKey(data, Key.up) &&
          !matchesKey(data, Key.down) &&
          !matchesKey(data, Key.enter) &&
          !matchesKey(data, Key.escape)
        ) {
          return { consume: true };
        }
      }

      const PLAN_OPTIONS = ["apply", "no", "revise"] as const;
      const sel = pr.selection ?? 0;
      if (matchesKey(data, Key.up)) {
        chatTerminal.store.dispatch({
          planReview: {
            active: true,
            selection: (sel + PLAN_OPTIONS.length - 1) % PLAN_OPTIONS.length,
          },
        });
        tui.requestRender();
        return { consume: true };
      }
      if (matchesKey(data, Key.down)) {
        chatTerminal.store.dispatch({
          planReview: {
            active: true,
            selection: (sel + 1) % PLAN_OPTIONS.length,
          },
        });
        tui.requestRender();
        return { consume: true };
      }
      if (matchesKey(data, Key.enter)) {
        const chosen = PLAN_OPTIONS[sel] ?? "apply";
        if (chosen === "revise") {
          // Enter revise mode: show input prompt instead of resolving immediately.
          chatTerminal.store.dispatch({
            planReview: { active: true, selection: sel, reviseMode: true },
          });
          tui.requestRender();
          return { consume: true };
        }
        chatTerminal.resolvePlanReview(chosen);
        return { consume: true };
      }
      if (matchesKey(data, Key.escape)) {
        chatTerminal.resolvePlanReview("cancel");
        return { consume: true };
      }
    }

    // Block input when plan review is active but not in revise mode.
    // This prevents typing when the user hasn't selected "revise" yet.
    if (state.planReview?.active && !state.planReview.reviseMode) {
      // Only allow navigation keys (up, down, enter, escape)
      if (
        matchesKey(data, Key.up) ||
        matchesKey(data, Key.down) ||
        matchesKey(data, Key.enter) ||
        matchesKey(data, Key.escape)
      ) {
        // These are handled above in the plan review section
        return { consume: true };
      }
      // Block all other input
      return { consume: true };
    }

    // All other input → async editor handler (image paste detection + editor routing).
    void handleEditorInput(data);
    return { consume: true };
  });

  // ── lifecycle ─────────────────────────────────────────────────────────────

  function cleanup(): void {
    if (stopped) return;
    stopped = true;
    if (exitConfirmTimer) {
      clearTimeout(exitConfirmTimer);
      exitConfirmTimer = undefined;
    }
    if (tick) {
      clearInterval(tick);
      tick = undefined;
    }
    unsubscribe?.();
    process.off("SIGINT", handleInterrupt);
    tui.stop();
  }

  process.once("exit", cleanup);
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGINT", handleInterrupt);

  await initShiki().catch(() => {});

  tui.start();

  // ── spinner tick ──────────────────────────────────────────────────────────

  tick = setInterval(() => {
    const state = chatTerminal.store.getState();
    // Skip spinner tick when plan review is active — user may be scrolling to
    // read the plan and a re-render would reset the TUI viewport to the bottom.
    if (state.planReview?.active) return;
    if (isActiveTaskPhase(state.task.phase) || state.synthRunning) {
      frame = (frame + 1) % SPINNER.length;
      tui.requestRender();
    }
  }, 120);

  // ── store subscription ────────────────────────────────────────────────────

  unsubscribe = chatTerminal.bus.on("screen:refresh", () => {
    tui.requestRender();
  });

  // ── wait for stop ─────────────────────────────────────────────────────────

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (stopped) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}
