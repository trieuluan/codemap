import { useState } from "react";
import {
  Check,
  FolderGit2,
  GitBranch,
  MessageSquareMore,
  MessageSquarePlus,
  MessagesSquare,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import type { SessionSnapshot, ThreadSummary } from "@codemap-ai/core/agent/contracts";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu.js";

interface ThreadSidebarProps {
  workspace: string;
  threads: ThreadSummary[];
  snapshot: SessionSnapshot;
  sidebarOpen: boolean;
  sidebarWidth: number;
  selectedThreadIds: string[];
  isLoading: boolean;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  onDeleteThread: (threadId: string) => void;
  onToggleThreadSelection: (threadId: string, shiftKey?: boolean) => void;
  onDeleteSelectedThreads: () => void;
  onClearSelection: () => void;
  onStartSidebarResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  lastSelectedThreadId: string | null;
  onSetLastSelectedThreadId: (id: string | null) => void;
}


function getThreadDisplayTitle(thread: ThreadSummary): string {
  if (thread.title) return thread.title;
  const fallback = (thread as { metadata?: { mastra?: { om?: { threadTitle?: string } } } }).metadata
    ?.mastra?.om?.threadTitle;
  return fallback || "Untitled session";
}

type ThreadGroup = "Today" | "Yesterday" | "Earlier";

function threadGroup(thread: ThreadSummary): ThreadGroup {
  const rawDate = thread.updatedAt ?? thread.createdAt;
  if (!rawDate) return "Earlier";
  const date = new Date(rawDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (day === today) return "Today";
  if (day === today - 86_400_000) return "Yesterday";
  return "Earlier";
}

function relativeThreadTime(thread: ThreadSummary) {
  const rawDate = thread.updatedAt ?? thread.createdAt;
  if (!rawDate) return "Saved";
  const elapsed = Math.max(0, Date.now() - new Date(rawDate).getTime());
  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ThreadSidebar({
  workspace,
  threads,
  snapshot,
  sidebarOpen,
  sidebarWidth,
  selectedThreadIds,
  isLoading,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onToggleThreadSelection,
  onDeleteSelectedThreads,
  onClearSelection,
  onStartSidebarResize,
  lastSelectedThreadId,
  onSetLastSelectedThreadId,
}: ThreadSidebarProps) {
  const [query, setQuery] = useState("");
  const [contextMenuThreadId, setContextMenuThreadId] = useState<string | null>(null);
  const projectName = workspace.split("/").filter(Boolean).at(-1) ?? "CodeMap";
  const hasSelectedThreads = selectedThreadIds.length > 0;
  const isSelectionMode = hasSelectedThreads;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleThreads = normalizedQuery
    ? threads.filter((thread) =>
        getThreadDisplayTitle(thread).toLowerCase().includes(normalizedQuery),
      )
    : threads;
  const groupedThreads = (["Today", "Yesterday", "Earlier"] as const)
    .map((group) => ({
      group,
      threads: visibleThreads.filter((thread) => threadGroup(thread) === group),
    }))
    .filter(({ threads: groupThreads }) => groupThreads.length > 0);

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
      <aside className="flex min-w-0 flex-col gap-2.5 overflow-x-hidden border-borderar-gradient(180deg,#0f0f10_0%,#111114_100%)] p-3 transition-[padding,border]" style={{ width: sidebarOpen ? sidebarWidth : 0 }}>
        <div className="flex items-center gap-2.5 px-1 pb-0.5 pt-1.5">
          <span className="inline-flex h-8.5[w-8.5ems-center justify-center rounded-[10px] border borborder-border-[var(--card)] text-[var(--text-dim)]">
            <FolderGit2 size={17} />
          </span>
          <div className="grid min-w-0 gap-1">
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[var(--text-dim)]" title={workspace}>{projectName}</strong>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <GitBranch size={11} />
              main
              <span className="text-[var(--muted)]">·</span>
              <span className="text-[var(--muted)]">clean</span>
            </span>
          </div>
        </div>

        <div className="grid gap-2.5">
          <button className="primary-button w-full text-[13px]" type="button" onClick={onCreateThread}>
            <MessageSquarePlus size={15} />
            New thread
          </button>
          <label className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[var(--muted)] focus-within:border-[var(--border-focus)]">
            <Search size={14} />
            <input
              aria-label="Search threads"
              className="w-full border-0 bg-transparent text-[13px] text-[var(--foreground)] outline-0 placeholder:text-[var(--muted)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search threads"
              value={query}
            />
            {query && (
              <button className="inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text-dim)]" onClick={() => setQuery("")} title="Clear search" type="button">
                <X size={13} />
              </button>
            )}
          </label>
        </div>

        {hasSelectedThreads && (
          <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--border)] bg-[rgb(255_255_255/4%)] px-3 py-2.5">
            <div className="min-w-0">
              <span className="eyebrow">Selection</span>
              <span className="mx-1.5 text-[var(--muted)]">·</span>
              <span className="text-[13px] font-medium text-[#ededee]">{selectedThreadIds.length} selected</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                className="inline-flex h-[28px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-[color-mix(in_srgb,var(--danger),transparent_50%)] bg-transparent px-2 text-[12px] text-[#e7b0b0] transition-colors hover:border-[color-mix(in_srgb,var(--danger),transparent_25%)] hover:bg-[color-mix(in_srgb,var(--danger),transparent_90%)] hover:text-[#f0c2c2]"
                type="button"
                onClick={onDeleteSelectedThreads}
                title="Delete selected threads"
              >
                <Trash2 size={12} />
                Delete
              </button>
              <button
                className="inline-flex h-[28px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-[var(--border)] bg-transparent px-2 text-[12px] text-[var(--text-dim)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--hover)] hover:text-[#ededee]"
                type="button"
                onClick={onClearSelection}
                title="Clear selection"
              >
                <X size={12} />
                Clear
              </button>
            </div>
          </div>
        )}

        <div className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto p-1 ${isSelectionMode ? "selection-mode" : ""}`}>
          <div className="flex items-center justify-between px-1 pb-2 pt-1 text-xs text-[var(--muted)]">
            <p className="eyebrow">Threads</p>
            <span className="text-[11px] text-[var(--muted)]">{threads.length}</span>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2.5 px-1 py-1">
              <div className="h-[13px] w-10 animate-pulse rounded bg-[rgb(255_255_255/6%)]" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[34px] w-full animate-pulse rounded-[10px] bg-[rgb(255_255_255/4%)]" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgb(255_255_255/2%)] px-3.5 py-3">
              <MessageSquareMore size={16} className="text-[var(--muted)]" />
              <p className="text-[12px] leading-[1.5] text-[var(--muted)]">No saved threads yet. Start a new thread to begin.</p>
            </div>
          ) : visibleThreads.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgb(255_255_255/2%)] px-3.5 py-3">
              <SearchX size={16} className="text-[var(--muted)]" />
              <p className="text-[12px] leading-[1.5] text-[var(--muted)]">No threads match &ldquo;{query}&rdquo;.</p>
            </div>
          ) : (
            groupedThreads.map(({ group, threads: groupItems }) => (
              <section className="flex flex-col gap-1.5" key={group}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{group}</div>
                {groupItems.map((thread) => {
              const isActive = snapshot.threadId === thread.id;
              const isSelected = selectedThreadIds.includes(thread.id);
              const title = getThreadDisplayTitle(thread);
              return (
                <ContextMenu key={thread.id} onOpenChange={(open) => setContextMenuThreadId(open ? thread.id : null)}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={[
                        "group relative flex w-full items-center rounded-[10px] border border-transparent bg-transparent transition-[background,border-color] duration-100",
                        "hover:border-[var(--border)] hover:bg-[rgb(255_255_255/3.5%)]",
                        isActive ? "bg-[linear-gradient(180deg,#1a1a1e,#161619)] before:absolute before:bottom-[9px] before:left-0 before:top-[9px] before:w-0.5 before:rounded-r-[3px] before:bg-[#d4d4d6] before:content-['']" : "",
                        isSelected ? "border-border bg-(--hover)" : "",
                        contextMenuThreadId === thread.id ? "border-[var(--border)] bg-[rgb(255_255_255/3.5%)]" : "",
                      ].join(" ")}
                    >
                      <button
                        className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent py-2.25 pl-3.25 pr-2 text-left"
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
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-[var(--text-dim)]">{title}</span>
                        <span className="mt-[3px] flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--muted)] [&_i]:inline-flex [&_i]:items-center [&_i]:gap-1 [&_i]:not-italic [&_span]:inline-flex [&_span]:items-center [&_span]:gap-1">
                          <span>
                            <MessagesSquare size={11} />
                            session
                          </span>
                          <i>·</i>
                          {relativeThreadTime(thread)}
                        </span>
                      </button>

                      <div className={[
                        "shrink-0 items-center gap-1.5 pr-2 py-2",
                        isSelectionMode ? "flex" : "hidden",
                      ].join(" ")}>
                        <button
                          className={[
                            "thread-action-btn inline-flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-lg border-0 p-0 transition-[background,color] hover:bg-[rgb(255_255_255/6%)] hover:text-[#ededee] focus-visible:bg-[rgb(255_255_255/6%)] focus-visible:text-[#ededee]",
                            isSelected ? "bg-[rgb(255_255_255/12%)] text-[#ededee] ring-1 ring-inset ring-[rgb(255_255_255/20%)]" : "bg-transparent text-[var(--muted)]",
                          ].join(" ")}
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
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-[140px] rounded-lg border border-white/10 bg-[#1a1a1f]/95 p-[3px] shadow-xl backdrop-blur-sm">
                    <ContextMenuItem
                      className="gap-2 rounded-md px-2 py-[5px] text-[13px] hover:bg-white/[0.06]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleThreadSelection(thread.id, event.shiftKey);
                      }}
                    >
                      <Check size={14} />
                      {isSelected ? "Deselect thread" : "Select thread"}
                    </ContextMenuItem>
                    <ContextMenuItem
                      className="gap-2 rounded-md px-2 py-[5px] text-[13px] text-[#e7b0b0] hover:bg-white/[0.06]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteThread(thread.id);
                      }}
                    >
                      <Trash2 size={14} />
                      Delete thread
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
                })}
              </section>
            ))
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
