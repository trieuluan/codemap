import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { ThreadSummary } from "@codemap-ai/core/agent/contracts";
import type { McpStatusResult, SettingsMetadata } from "../../shared/ipc.js";
import type { RuntimeStatus } from "../types.js";
import { ThreadSidebar } from "../components/ThreadSidebar.js";
import { ConversationPanel } from "../components/ConversationPanel.js";
import { ComposerFooter } from "../components/ComposerFooter.js";
import { ChatRightRail, type InspectorTab } from "../components/RightRail.js";
import { useAgentSession } from "../hooks/useAgentSession.js";
import { useSidebarResize } from "../hooks/useSidebarResize.js";
import { useInspectorResize } from "../hooks/useInspectorResize.js";
import { useThreadSelection } from "../hooks/useThreadSelection.js";

interface ChatPageProps {
  workspace: string;
  runtimeStatus: RuntimeStatus;
  mode: "build" | "plan" | "fast";
  settings: SettingsMetadata | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onModelChange: (model: string) => void;
  onModeChange: (mode: "build" | "plan" | "fast") => void;
  onThreadsRefresh: () => Promise<void>;
}

export function ChatPage({
  workspace,
  runtimeStatus,
  mode,
  settings,
  sidebarOpen,
  onToggleSidebar,
  onModelChange,
  onModeChange,
  onThreadsRefresh,
}: ChatPageProps) {
  const navigate = useNavigate();

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("plan");
  const [error, setError] = useState<string | null>(null);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpSummary, setMcpSummary] = useState<McpStatusResult | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);

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

  const { clampedWidth: sidebarWidth, startResize: startSidebarResize } =
    useSidebarResize(sidebarOpen);
  const { clampedWidth: inspectorWidth, startResize: startInspectorResize } =
    useInspectorResize(inspectorOpen);

  const isBusy = snapshot.status === "running" || snapshot.status === "aborting";

  useEffect(() => { void refreshThreads(); }, [workspace]);

  async function refreshThreads() {
    setLoadingThreads(true);
    try {
      const next = await window.codemap.listThreads();
      setThreads(next);
    } catch {
      // non-critical
    } finally {
      setLoadingThreads(false);
    }
  }

  async function createThread() {
    await window.codemap.newThread();
    resetSession();
    await Promise.all([refreshThreads(), onThreadsRefresh()]);
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
      await refreshThreads();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const threadSelection = useThreadSelection(threads, removeThreads);

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
      if (name === "clear") { await createThread(); return; }
      if (name === "mcp") { await openMcpPanel(); return; }
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
    if (action === "apply") onModeChange("build");
    try {
      await window.codemap.respondToPlanReview(planReviewId, action, feedback);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
        mode,
        images: images.length > 0 ? images : undefined,
      });
      await Promise.all([refreshThreads(), onThreadsRefresh()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div
      className={`app-shell ${sidebarOpen ? "" : "sidebar-closed"}`}
      style={
        sidebarOpen
          ? { gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr)` }
          : undefined
      }
    >
      <ThreadSidebar
        workspace={workspace}
        threads={threads}
        snapshot={snapshot}
        sidebarOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
        selectedThreadIds={threadSelection.selectedThreadIds}
        isLoading={loadingThreads}
        onSelectThread={switchThread}
        onCreateThread={createThread}
        onDeleteThread={deleteThread}
        onToggleThreadSelection={threadSelection.toggleSelection}
        onDeleteSelectedThreads={threadSelection.deleteSelected}
        onClearSelection={threadSelection.clearSelection}
        onStartSidebarResize={startSidebarResize}
        lastSelectedThreadId={threadSelection.lastSelectedThreadId}
        onSetLastSelectedThreadId={threadSelection.setLastSelectedThreadId}
      />

      <section className="main-panel">
        <div className="workspace-body">
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
              onAnswerQuestion={(id, answer) => window.codemap.respondToQuestion(id, answer)}
              onSubmitPrompt={(content) => void submit(content, [])}
            />
            <ComposerFooter
              runtimeStatus={runtimeStatus}
              isBusy={isBusy}
              allowSubmitWhileBusy={Boolean(snapshot.pendingPlanReview)}
              mode={mode}
              selectedModel={settings?.defaultModel ?? "coder"}
              availableModels={settings?.availableModels ?? []}
              onModelChange={onModelChange}
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

          <ChatRightRail
            mode={mode}
            snapshot={snapshot}
            open={inspectorOpen}
            width={inspectorWidth}
            tab={inspectorTab}
            selectedModel={settings?.defaultModel ?? "coder"}
            onTabChange={setInspectorTab}
            onToggle={() => setInspectorOpen((v) => !v)}
            onStartResize={startInspectorResize}
            onRespondToPlanReview={respondToPlanReview}
          />
        </div>
      </section>
    </div>
  );
}
