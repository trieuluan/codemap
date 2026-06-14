import {
  Check,
  ChevronLeft,
  EllipsisVertical,
  FolderOpen,
  MessageSquareMore,
  MessageSquarePlus,
  Trash2,
  X,
} from "lucide-react";
import type { SessionSnapshot, ThreadSummary } from "@codemap-ai/core/agent/contracts";

interface ThreadSidebarProps {
  workspace: string;
  threads: ThreadSummary[];
  snapshot: SessionSnapshot;
  sidebarOpen: boolean;
  sidebarWidth: number;
  selectedThreadIds: string[];
  onToggleSidebar: () => void;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  onDeleteThread: (threadId: string) => void;
  onToggleThreadSelection: (threadId: string, shiftKey?: boolean) => void;
  onDeleteSelectedThreads: () => void;
  onClearSelection: () => void;
  onOpenWorkspace: () => void;
  onStartSidebarResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSetOpenThreadMenuId: (id: string | null) => void;
  openThreadMenuId: string | null;
  lastSelectedThreadId: string | null;
  onSetLastSelectedThreadId: (id: string | null) => void;
}

function getThreadDisplayTitle(thread: ThreadSummary): string {
  if (thread.title) return thread.title;
  const fallback = (thread as { metadata?: { mastra?: { om?: { threadTitle?: string } } } }).metadata
    ?.mastra?.om?.threadTitle;
  return fallback || "Untitled session";
}

export function ThreadSidebar({
  workspace,
  threads,
  snapshot,
  sidebarOpen,
  sidebarWidth,
  selectedThreadIds,
  onToggleSidebar,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onToggleThreadSelection,
  onDeleteSelectedThreads,
  onClearSelection,
  onOpenWorkspace,
  onStartSidebarResize,
  onSetOpenThreadMenuId,
  openThreadMenuId,
  lastSelectedThreadId,
  onSetLastSelectedThreadId,
}: ThreadSidebarProps) {
  const projectName = workspace.split("/").filter(Boolean).at(-1) ?? "CodeMap";
  const hasSelectedThreads = selectedThreadIds.length > 0;
  const isSelectionMode = hasSelectedThreads;

  function selectThreadRange(threadId: string) {
    if (!lastSelectedThreadId) {
      onToggleThreadSelection(threadId);
      onSetLastSelectedThreadId(threadId);
      return;
    }

    const startIndex = threads.findIndex((thread) => thread.id === lastSelectedThreadId);
    const endIndex = threads.findIndex((thread) => thread.id === threadId);
    if (startIndex === -1 || endIndex === -1) {
      onToggleThreadSelection(threadId);
      onSetLastSelectedThreadId(threadId);
      return;
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const rangeIds = threads.slice(from, to + 1).map((thread) => thread.id);
    rangeIds.forEach((id) => {
      if (!selectedThreadIds.includes(id)) onToggleThreadSelection(id);
    });
    onSetLastSelectedThreadId(threadId);
  }

  return (
    <>
      <aside className="sidebar" style={{ width: sidebarOpen ? sidebarWidth : 0 }}>
        <div className="sidebar-header sidebar-section-card">
          <div className="sidebar-header-copy">
            <p className="eyebrow">Workspace</p>
            <strong title={workspace}>{projectName}</strong>
            <span className="sidebar-path" title={workspace}>
              {workspace}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onToggleSidebar}
            title="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <div className="sidebar-toolbar sidebar-section-card">
          <button className="primary-button sidebar-primary-action" type="button" onClick={onCreateThread}>
            <MessageSquarePlus size={15} />
            New thread
          </button>
          <button className="secondary-button" type="button" onClick={onOpenWorkspace}>
            <FolderOpen size={15} />
            Change workspace
          </button>
        </div>

        {hasSelectedThreads && (
          <div className="sidebar-selection-bar sidebar-section-card">
            <div>
              <p className="eyebrow">Selection</p>
              <strong>{selectedThreadIds.length} selected</strong>
            </div>
            <div className="sidebar-header-actions">
              <button
                className="secondary-button danger-button"
                type="button"
                onClick={onDeleteSelectedThreads}
                title="Delete selected threads"
              >
                <Trash2 size={14} />
                Delete
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={onClearSelection}
                title="Clear selection"
              >
                <X size={14} />
                Clear
              </button>
            </div>
          </div>
        )}

        <div className={isSelectionMode ? "thread-list selection-mode" : "thread-list"}>
          <div className="thread-list-header">
            <p className="eyebrow">Threads</p>
            <span>{threads.length}</span>
          </div>

          {threads.length === 0 ? (
            <div className="thread-empty-state sidebar-section-card">
              <MessageSquareMore size={18} />
              <p className="empty-note">No saved threads yet. Start a new thread to begin.</p>
            </div>
          ) : (
            threads.map((thread) => {
              const isActive = snapshot.threadId === thread.id;
              const isMenuOpen = openThreadMenuId === thread.id;
              const isSelected = selectedThreadIds.includes(thread.id);
              const title = getThreadDisplayTitle(thread);
              return (
                <div
                  key={thread.id}
                  className={`thread-item ${isActive ? "active" : ""} ${isSelected ? "selected" : ""}`}
                  onMouseLeave={() => {
                    if (isMenuOpen) onSetOpenThreadMenuId(null);
                  }}
                >
                  <button
                    className="thread-item-button"
                    type="button"
                    onClick={(event) => {
                      if (event.shiftKey) {
                        selectThreadRange(thread.id);
                        return;
                      }
                      if (event.metaKey || event.ctrlKey || isSelectionMode) {
                        onToggleThreadSelection(thread.id);
                        return;
                      }
                      void onSelectThread(thread.id);
                    }}
                  >
                    <span>{title}</span>
                    <code>{thread.id.slice(0, 8)}</code>
                  </button>

                  <div className="thread-actions">
                    <button
                      className={isSelected ? "thread-select-trigger selected" : "thread-select-trigger"}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleThreadSelection(thread.id, event.shiftKey);
                      }}
                      title={isSelected ? "Deselect thread" : "Select thread"}
                      aria-label={`${isSelected ? "Deselect" : "Select"} ${title}`}
                    >
                      <Check size={13} />
                    </button>
                    {!isSelectionMode && (
                      <button
                        className={isMenuOpen ? "thread-menu-trigger open" : "thread-menu-trigger"}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSetOpenThreadMenuId(openThreadMenuId === thread.id ? null : thread.id);
                        }}
                        title="Thread actions"
                        aria-label={`Actions for ${title}`}
                      >
                        <EllipsisVertical size={14} />
                      </button>
                    )}
                  </div>

                  {isMenuOpen && (
                    <div className="thread-menu">
                      <button
                        className="thread-menu-item"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleThreadSelection(thread.id, event.shiftKey);
                          onSetOpenThreadMenuId(null);
                        }}
                      >
                        <Check size={14} />
                        {isSelected ? "Deselect thread" : "Select thread"}
                      </button>
                      <button
                        className="thread-menu-item danger"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteThread(thread.id);
                        }}
                      >
                        <Trash2 size={14} />
                        Delete thread
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
      {sidebarOpen && (
        <div
          className="sidebar-resize-handle"
          onPointerDown={onStartSidebarResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
      )}
    </>
  );
}
