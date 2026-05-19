import type { ChatContextItem, ChatContextState } from "../ui/store.js";

export type ChatContextAction =
  | { type: "ADD_CONTEXT_ITEM"; item: ChatContextItem }
  | { type: "REMOVE_CONTEXT_ITEM"; id: string }
  | { type: "PIN_CONTEXT_ITEM"; id: string; pinned?: boolean }
  | { type: "CLEAR_CONTEXT" }
  | { type: "INCLUDE_DIFF"; label?: string; metadata?: Record<string, unknown> }
  | { type: "EXCLUDE_DIFF" };

export function createEmptyChatContextState(): ChatContextState {
  return { files: [], symbols: [], searches: [], diffs: [], toolCalls: [], assumptions: [] };
}

function bucketFor(type: ChatContextItem["type"]): keyof ChatContextState {
  if (type === "tool_call") return "toolCalls";
  if (type === "assumption") return "assumptions";
  return `${type}s` as keyof ChatContextState;
}

export function updateChatContext(state: ChatContextState, action: ChatContextAction): ChatContextState {
  if (action.type === "CLEAR_CONTEXT") {
    const keepPinned = (items: ChatContextItem[]) => items.filter((item) => item.pinned);
    return {
      files: keepPinned(state.files),
      symbols: keepPinned(state.symbols),
      searches: keepPinned(state.searches),
      diffs: keepPinned(state.diffs),
      toolCalls: keepPinned(state.toolCalls),
      assumptions: keepPinned(state.assumptions),
    };
  }

  if (action.type === "INCLUDE_DIFF") {
    return updateChatContext(state, {
      type: "ADD_CONTEXT_ITEM",
      item: {
        id: "current-diff",
        type: "diff",
        label: action.label ?? "Current local diff",
        source: "system",
        pinned: false,
        createdAt: new Date().toISOString(),
        metadata: action.metadata,
      },
    });
  }

  if (action.type === "EXCLUDE_DIFF") {
    return updateChatContext(state, { type: "REMOVE_CONTEXT_ITEM", id: "current-diff" });
  }

  const mutate = (items: ChatContextItem[]) => {
    if (action.type === "ADD_CONTEXT_ITEM") {
      const withoutExisting = items.filter((item) => item.id !== action.item.id);
      return [...withoutExisting, action.item];
    }
    if (action.type === "REMOVE_CONTEXT_ITEM") return items.filter((item) => item.id !== action.id);
    if (action.type === "PIN_CONTEXT_ITEM") return items.map((item) => item.id === action.id ? { ...item, pinned: action.pinned ?? true } : item);
    return items;
  };

  if (action.type === "ADD_CONTEXT_ITEM") {
    const key = bucketFor(action.item.type);
    return { ...state, [key]: mutate(state[key]) };
  }

  return {
    files: mutate(state.files),
    symbols: mutate(state.symbols),
    searches: mutate(state.searches),
    diffs: mutate(state.diffs),
    toolCalls: mutate(state.toolCalls),
    assumptions: mutate(state.assumptions),
  };
}

export function summarizeChatContext(state: ChatContextState): string {
  const parts = [
    state.files.length ? `${state.files.length} files` : null,
    state.symbols.length ? `${state.symbols.length} symbols` : null,
    state.searches.length ? `${state.searches.length} searches` : null,
    state.diffs.length ? "diff included" : null,
  ].filter(Boolean);
  return parts.join(", ") || "No active context";
}
