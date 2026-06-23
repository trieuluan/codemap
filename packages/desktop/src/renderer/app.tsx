import { useEffect, useRef, useState, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import type { ThreadSummary } from "@codemap-ai/core/agent/contracts";
import type { McpStatusResult, SettingsMetadata } from "../shared/ipc.js";
import type { RuntimeStatus } from "./types.js";
import { ThreadSidebar } from "./components/ThreadSidebar.js";
import { ConversationPanel } from "./components/ConversationPanel.js";
import { ComposerFooter } from "./components/ComposerFooter.js";
import { Topbar } from "./components/Topbar.js";
import { RightRail, type InspectorTab } from "./components/RightRail.js";
import { Launcher, type RecentWorkspace } from "./components/Launcher.js";
import { useAgentSession } from "./hooks/useAgentSession.js";
import { useInspectorResize } from "./hooks/useInspectorResize.js";
import { useSidebarResize } from "./hooks/useSidebarResize.js";
import { useThreadSelection } from "./hooks/useThreadSelection.js";
import { MapPage } from "./pages/MapPage.js";
import { AccountPage } from "./pages/AccountPage.js";
import McpDetailPage from "./pages/McpDetailPage.js";

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"build" | "plan" | "fast">("build");
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
  const [openingWorkspace, setOpeningWorkspace] = useState<string | null>(null);
  const [workspaceOpenError, setWorkspaceOpenError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpSummary, setMcpSummary] = useState<McpStatusResult | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const openingWorkspaceRef = useRef(false);

  const {
    snapshot,
    displayItems,
    loadingMessages,
    switchThread,
    resetSession,
    appendUserMessage,
    appendSystemMessage,
    resetSnapshotForSubmit,
  } = useAgentSession(setError);
  const { clampedWidth, startResize } = useSidebarResize(sidebarOpen);
  const { clampedWidth: inspectorWidth, startResize: startInspectorResize } =
    useInspectorResize(inspectorOpen);
  const threadSelection = useThreadSelection(threads, removeThreads);

  const isBusy = snapshot.status === "running" || snapshot.status === "aborting";

  // Derive active top-level view from route
  const isAccountRoute = location.pathname.startsWith("/account");

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
        ...current.filter((r) => r.path !== path),
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
      navigate("/chat");
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
    if (snapshot.pendingPlanReview && content.trim() && images.length === 0) {
      setError(null);
      appendUserMessage(content);
      try {
        await window.codemap.respondToPlanReview(
          snapshot.pendingPlanReview.planReviewId,
          "revise",
          content.trim(),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
      return;
    }
    if ((!content && images.length === 0) || !workspace || isBusy) return;
    setError(null);
    appendUserMessage(content, images);
    resetSnapshotForSubmit();
    try {
      await window.codemap.send(content, {
        model: settings?.defaultModel,
        mode: mode,
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
    setSidebarOpen((v) => !v);
  }

  function toggleInspector() {
    setInspectorOpen((v) => !v);
  }

  function changeModel(model: string) {
    setSettings((current) => (current ? { ...current, defaultModel: model } : current));
  }

  const openMcpPanel = useCallback(async () => {
    setMcpOpen(true);
    setMcpLoading(true);
    try {
      const result = await window.codemap.getMcpStatus();
      setMcpSummary(result);
    } catch {
      setMcpSummary(null);
    } finally {
      setMcpLoading(false);
    }
  }, []);

  const handleSlashCommand = useCallback(
    async (name: string, args: string) => {
      if (name === "clear") {
        await createThread();
        return;
      }
      if (name === "mcp") {
        await openMcpPanel();
        return;
      }
      if (name === "diff") {
        setInspectorOpen(true);
        setInspectorTab("diff");
        return;
      }
      if (["login", "logout", "projects", "link"].includes(name)) {
        navigate("/account/identity");
        return;
      }
      try {
        const result = await window.codemap.runSlashCommand(name, args);
        if (result?.output) appendSystemMessage(result.output);
      } catch (cause) {
        appendSystemMessage(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [openMcpPanel, appendSystemMessage, navigate],
  );

  async function respondToPlanReview(
    planReviewId: string,
    action: "apply" | "reject" | "revise",
    feedback?: string,
  ) {
    setError(null);
    if (action === "apply") setMode("build");
    try {
      await window.codemap.respondToPlanReview(planReviewId, action, feedback);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
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
      className={`app-shell ${sidebarOpen ? "" : "sidebar-closed"} ${inspectorOpen && !isAccountRoute ? "inspector-open" : "inspector-closed"}`}
      style={
        sidebarOpen
          ? { gridTemplateColumns: `${clampedWidth}px 6px minmax(0, 1fr)` }
          : undefined
      }
    >
      {/* Sidebar: hide on account page (full-width) */}
      {!isAccountRoute && (
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
      )}

      <section className={`main-panel ${isAccountRoute ? "main-panel-full" : ""}`}>
        <Topbar
          runtimeStatus={runtimeStatus}
          workspace={workspace}
          recents={recents}

          mode={mode}
          onModeChange={setMode}
          onToggleSidebar={toggleSidebar}

          onRestart={() => window.codemap.restartRuntime()}
          onSwitchWorkspace={(path) => void openWorkspace(path)}
          onOpenWorkspace={() => void openWorkspace()}
          onOpenLauncher={() => setWorkspace(null)}
        />

        {/* Account page: full-width, no RightRail */}
        {isAccountRoute ? (
          <div className="workspace-body workspace-body-account">
            <Routes>
              <Route path="/account" element={<Navigate to="/account/identity" replace />} />
              <Route path="/account/mcp/:server" element={<McpDetailPage />} />
              <Route path="/account/:section" element={<AccountPage />} />
            </Routes>
          </div>
        ) : (
          <div className="workspace-body">
            <Routes>
              <Route
                path="/chat"
                element={
                  <div className="conversation-column">
                    <ConversationPanel
                      displayItems={displayItems}
                      snapshot={snapshot}
                      error={error}
                      isBusy={isBusy}
                      loadingMessages={loadingMessages}
                      workspaceRoot={workspace}
                      pendingPlanReview={snapshot.pendingPlanReview}
                      onApprove={(id) => window.codemap.respondToApproval(id, "approve")}
                      onDecline={(id) => window.codemap.respondToApproval(id, "decline")}
                      onAnswerQuestion={(id, answer) =>
                        window.codemap.respondToQuestion(id, answer)
                      }
                      onSubmitPrompt={(content) => void submit(content, [])}
                    />
                    <ComposerFooter
                      runtimeStatus={runtimeStatus}
                      isBusy={isBusy}
                      allowSubmitWhileBusy={Boolean(snapshot.pendingPlanReview)}
                      mode={mode}
                      selectedModel={settings?.defaultModel ?? "coder"}
                      availableModels={settings?.availableModels ?? []}
                      onModelChange={changeModel}
                      onSubmit={submit}
                      onStop={() => window.codemap.abort()}
                      onShowMcp={openMcpPanel}
                      onSlashCommand={handleSlashCommand}
                      mcpOpen={mcpOpen}
                      mcpSummary={mcpSummary}
                      mcpLoading={mcpLoading}
                      onCloseMcp={() => setMcpOpen(false)}
                    />
                  </div>
                }
              />
              <Route path="/map" element={<MapPage />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>

            <RightRail
              mode={mode}
              snapshot={snapshot}
              open={inspectorOpen}
              width={inspectorWidth}
              tab={inspectorTab}
              selectedModel={settings?.defaultModel ?? "coder"}
              onTabChange={setInspectorTab}
              onToggle={toggleInspector}
              onStartResize={startInspectorResize}
              onRespondToPlanReview={respondToPlanReview}
            />
          </div>
        )}
      </section>
    </div>
  );
}
