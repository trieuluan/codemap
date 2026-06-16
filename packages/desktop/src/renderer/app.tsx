import { useEffect, useRef, useState } from "react";
import type { ThreadSummary } from "@codemap-ai/core/agent/contracts";
import type { SettingsMetadata } from "../shared/ipc.js";
import type { RuntimeStatus } from "./types.js";
import { ThreadSidebar } from "./components/ThreadSidebar.js";
import { ConversationPanel } from "./components/ConversationPanel.js";
import { ComposerFooter } from "./components/ComposerFooter.js";
import { Topbar } from "./components/Topbar.js";
import { CodeMapPanel } from "./components/CodeMapPanel.js";
import {
  RightRail,
  type InspectorTab,
} from "./components/RightRail.js";
import {
  Launcher,
  type RecentWorkspace,
} from "./components/Launcher.js";
import { useAgentSession } from "./hooks/useAgentSession.js";
import { useSidebarResize } from "./hooks/useSidebarResize.js";
import { useThreadSelection } from "./hooks/useThreadSelection.js";

export function App() {
  const [mode, setMode] = useState<"plan" | "build">("build");
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("disconnected");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [settings, setSettings] = useState<SettingsMetadata | null>(null);
  const [recents, setRecents] = useState<RecentWorkspace[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("codemap.recentWorkspaces") ?? "[]");
    } catch {
      return [];
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("plan");
  const [view, setView] = useState<"chat" | "map">("chat");
  const [openingWorkspace, setOpeningWorkspace] = useState<string | null>(null);
  const [workspaceOpenError, setWorkspaceOpenError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openingWorkspaceRef = useRef(false);

  const {
    snapshot,
    displayMessages,
    loadingMessages,
    switchThread,
    resetSession,
    appendUserMessage,
    resetSnapshotForSubmit,
  } = useAgentSession(setError);
  const { clampedWidth, startResize } = useSidebarResize(sidebarOpen);
  const threadSelection = useThreadSelection(threads, removeThreads);

  const isBusy = snapshot.status === "running" || snapshot.status === "aborting";
  useEffect(() => {
    return window.codemap.onRuntimeStatus((status) => {
      setRuntimeStatus(status);
      if (status === "ready") void refreshMetadata({ skipThreads: true });
    });
  }, []);

  async function refreshMetadata(options?: { skipThreads?: boolean }) {
    if (!options?.skipThreads) setLoadingThreads(true);
    try {
      const [nextSettings, nextThreads] = await Promise.all([
        window.codemap.readSettings(),
        options?.skipThreads ? Promise.resolve(null) : window.codemap.listThreads(),
      ]);
      setSettings(nextSettings);
      if (nextThreads !== null) setThreads(nextThreads);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingThreads(false);
    }
  }

  function rememberWorkspace(path: string) {
    const name = path.split("/").filter(Boolean).at(-1) ?? path;
    setRecents((current) => {
      const next = [
        { path, name, openedAt: Date.now() },
        ...current.filter((recent) => recent.path !== path),
      ].slice(0, 8);
      localStorage.setItem("codemap.recentWorkspaces", JSON.stringify(next));
      return next;
    });
  }

  async function openWorkspace(path?: string) {
    if (openingWorkspaceRef.current) return;
    openingWorkspaceRef.current = true;
    setOpeningWorkspace(path ?? "Choose folder");
    setWorkspaceOpenError(null);
    try {
      const selectedPath = path
        ? await window.codemap.openWorkspacePath(path)
        : await window.codemap.openWorkspace();
      if (!selectedPath) return;
      setWorkspace(selectedPath);
      setView("chat");
      rememberWorkspace(selectedPath);
      resetSession();
      await refreshMetadata();
    } catch (cause) {
      setWorkspaceOpenError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      openingWorkspaceRef.current = false;
      setOpeningWorkspace(null);
    }
  }

  async function submit(
    content: string,
    images: Array<{ data: string; mimeType: string; filename?: string }>,
  ) {
    if (!content || !workspace || isBusy) return;
    setError(null);
    appendUserMessage(content, images);
    resetSnapshotForSubmit();
    try {
      await window.codemap.send(content, {
        model: settings?.defaultModel,
        planMode: mode === "plan",
        images: images.length > 0 ? images : undefined,
      });
      await refreshMetadata();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function createThread() {
    await window.codemap.newThread();
    resetSession();
    await refreshMetadata();
  }

  async function deleteThread(threadId: string) {
    if (!window.confirm("Delete this thread?")) return;
    await removeThreads([threadId]);
  }

  async function removeThreads(threadIds: string[]) {
    if (threadIds.length === 0) return;
    setError(null);
    try {
      await Promise.all(threadIds.map((id) => window.codemap.deleteThread(id)));
      threadSelection.clearAfterRemove(threadIds);
      if (snapshot.threadId && threadIds.includes(snapshot.threadId)) resetSession();
      await refreshMetadata();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function toggleSidebar() {
    setSidebarOpen((value) => !value);
  }

  function toggleInspector() {
    setInspectorOpen((value) => !value);
  }

  function changeModel(model: string) {
    setSettings((current) => (current ? { ...current, defaultModel: model } : current));
  }

  if (!workspace) {
    return (
      <Launcher
        error={workspaceOpenError}
        openingWorkspace={openingWorkspace}
        recents={recents}
        onOpenWorkspace={() => void openWorkspace()}
        onResumeWorkspace={(path) => void openWorkspace(path)}
      />
    );
  }

  return (
    <div
      className={`app-shell ${sidebarOpen ? "" : "sidebar-closed"} ${inspectorOpen ? "inspector-open" : "inspector-closed"}`}
      style={
        sidebarOpen
          ? {
              gridTemplateColumns: `${clampedWidth}px 6px minmax(0, 1fr)`,
            }
          : undefined
      }
    >
      <ThreadSidebar
        workspace={workspace}
        threads={threads}
        snapshot={snapshot}
        sidebarOpen={sidebarOpen}
        sidebarWidth={clampedWidth}
        selectedThreadIds={threadSelection.selectedThreadIds}
        isLoading={loadingThreads}
        onSelectThread={switchThread}
        onCreateThread={createThread}
        onDeleteThread={deleteThread}
        onToggleThreadSelection={threadSelection.toggleSelection}
        onDeleteSelectedThreads={threadSelection.deleteSelected}
        onClearSelection={threadSelection.clearSelection}
        onStartSidebarResize={startResize}
        lastSelectedThreadId={threadSelection.lastSelectedThreadId}
        onSetLastSelectedThreadId={threadSelection.setLastSelectedThreadId}
      />

      <section className="main-panel">
        <Topbar
          runtimeStatus={runtimeStatus}
          settings={settings}
          workspace={workspace}
          recents={recents}
          inspectorOpen={inspectorOpen}
          mode={mode}
          view={view}
          onToggleSidebar={toggleSidebar}
          onModelChange={changeModel}
          onModeChange={setMode}
          onToggleInspector={toggleInspector}
          onViewChange={setView}
          onRestart={() => window.codemap.restartRuntime()}
          onSwitchWorkspace={(path) => void openWorkspace(path)}
          onOpenWorkspace={() => void openWorkspace()}
          onOpenLauncher={() => setWorkspace(null)}
        />

        <div className="workspace-body">
          {view === "chat" ? (
            <div className="conversation-column">
              <ConversationPanel
                displayMessages={displayMessages}
                snapshot={snapshot}
                error={error}
                isBusy={isBusy}
                loadingMessages={loadingMessages}
                workspaceRoot={workspace}
                onApprove={(id) => window.codemap.respondToApproval(id, "approve")}
                onDecline={(id) => window.codemap.respondToApproval(id, "decline")}
                onAnswerQuestion={(id, answer) => window.codemap.respondToQuestion(id, answer)}
                onSubmitPrompt={(content) => void submit(content, [])}
              />

              <ComposerFooter
                runtimeStatus={runtimeStatus}
                isBusy={isBusy}
                mode={mode}
                onSubmit={submit}
                onStop={() => window.codemap.abort()}
              />
            </div>
          ) : (
            <div className="map-column">
              <CodeMapPanel />
            </div>
          )}

          <RightRail
            mode={mode}
            snapshot={snapshot}
            settings={settings}
            open={inspectorOpen}
            tab={inspectorTab}
            onTabChange={setInspectorTab}
            onToggle={toggleInspector}
          />
        </div>
      </section>
    </div>
  );
}
