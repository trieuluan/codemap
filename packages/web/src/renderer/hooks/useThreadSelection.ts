import { useState } from "react";
import type { ThreadSummary } from "@codemap-ai/core/agent/contracts";

export function useThreadSelection(
  threads: ThreadSummary[],
  onRemoveThreads: (threadIds: string[]) => Promise<void>,
) {
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [lastSelectedThreadId, setLastSelectedThreadId] = useState<string | null>(null);

  const hasSelectedThreads = selectedThreadIds.length > 0;

  function selectRange(threadId: string) {
    if (!lastSelectedThreadId) {
      setSelectedThreadIds([threadId]);
      setLastSelectedThreadId(threadId);
      return;
    }

    const startIndex = threads.findIndex((t) => t.id === lastSelectedThreadId);
    const endIndex = threads.findIndex((t) => t.id === threadId);

    if (startIndex === -1 || endIndex === -1) {
      setSelectedThreadIds([threadId]);
      setLastSelectedThreadId(threadId);
      return;
    }

    const [from, to] =
      startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const rangeIds = threads.slice(from, to + 1).map((t) => t.id);
    setSelectedThreadIds(rangeIds);
    setLastSelectedThreadId(threadId);
  }

  function toggleSelection(threadId: string, shiftKey = false) {
    if (shiftKey) {
      selectRange(threadId);
      return;
    }

    setSelectedThreadIds((current) => {
      if (current.includes(threadId)) {
        const next = current.filter((id) => id !== threadId);
        setLastSelectedThreadId(next.at(-1) ?? null);
        return next;
      }
      setLastSelectedThreadId(threadId);
      return [...current, threadId];
    });
  }

  function clearAfterRemove(removedIds: string[]) {
    setSelectedThreadIds((current) => {
      const next = current.filter((id) => !removedIds.includes(id));
      if (next.length === 0) setLastSelectedThreadId(null);
      return next;
    });
  }

  async function deleteSelected() {
    if (!hasSelectedThreads) return;
    const confirmed = window.confirm(
      selectedThreadIds.length === 1
        ? "Delete the selected thread?"
        : `Delete ${selectedThreadIds.length} selected threads?`,
    );
    if (!confirmed) return;
    await onRemoveThreads(selectedThreadIds);
  }

  function clearSelection() {
    setSelectedThreadIds([]);
    setLastSelectedThreadId(null);
  }

  return {
    selectedThreadIds,
    lastSelectedThreadId,
    hasSelectedThreads,
    toggleSelection,
    clearAfterRemove,
    deleteSelected,
    clearSelection,
    setLastSelectedThreadId,
  };
}
