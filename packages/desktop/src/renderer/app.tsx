import { useEffect, useMemo, useState } from "react";
import { FolderOpen, TerminalSquare } from "lucide-react";
import type { ThreadSummary } from "@codemap-ai/core/agent/contracts";
import type { SettingsMetadata } from "../shared/ipc.js";
import type { RuntimeStatus } from "./types.js";
import { ThreadSidebar } from "./components/ThreadSidebar.js";
import { ConversationPanel } from "./components/ConversationPanel.js";
import { ComposerFooter } from "./components/ComposerFooter.js";
import { Topbar } from "./components/Topbar.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { useAgentSession } from "./hooks/useAgentSession.js";
import { useSidebarResize } from "./hooks/useSidebarResize.js";
import { useThreadSelection } from "./hooks/useThreadSelection.js";

export function App() {
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("disconnected");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [settings, setSettings] = useState<SettingsMetadata | null>(null);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<Array<{ data: string; mimeType: string }>>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    snapshot,
    displayMessages,
    resetSession,
    appendUserMessage,
    resetSnapshotForSubmit,
  } = useAgentSession(setError);
  const { clampedWidth, startResize } = useSidebarResize(sidebarOpen);
  const threadSelection = useThreadSelection(threads, removeThreads);

  const isBusy = snapshot.status === "running" || snapshot.status === "aborting";
  const workspaceName = useMemo(
    () => workspace?.split("/").filter(Boolean).at(-1) ?? "CodeMap",
    [workspace],
  );

  useEffect(() => {
    return window.codemap.onRuntimeStatus((status) => {
      setRuntimeStatus(status);
      if (status === "ready") void refreshMetadata({ skipThreads: true });
    });
  }, []);

  async function refreshMetadata(options?: { skipThreads?: boolean }) {
    try {
      const [nextSettings, nextThreads] = await Promise.all([
        window.codemap.readSettings(),
        options?.skipThreads ? Promise.resolve(null) : window.codemap.listThreads(),
      ]);
      setSettings(nextSettings);
      if (nextThreads !== null) setThreads(nextThreads);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function openWorkspace() {
    setError(null);
    const path = await window.codemap.openWorkspace();
    if (!path) return;
    setWorkspace(path);
    resetSession();
    await refreshMetadata();
  }

  async function submit() {
    const content = draft.trim();
    if (!content || !workspace || isBusy) return;
    setDraft("");
    setError(null);
    appendUserMessage(content);
    resetSnapshotForSubmit();
    const attached = images;
    setImages([]);
    try {
      await window.codemap.send(content, {
        model: settings?.defaultModel,
        images: attached.length > 0 ? attached : undefined,
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
    setOpenThreadMenuId(null);
    try {
      await Promise.all(threadIds.map((id) => window.codemap.deleteThread(id)));
      threadSelection.clearAfterRemove(threadIds);
      if (snapshot.threadId && threadIds.includes(snapshot.threadId)) resetSession();
      await refreshMetadata();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function attachImages(files: FileList | null) {
    if (!files) return;
    const next = await Promise.all(
      [...files].map(
        (file) =>
          new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onload = () => {
              const dataUrl = String(reader.result);
              resolve({
                data: dataUrl.slice(dataUrl.indexOf(",") + 1),
                mimeType: file.type || "image/png",
              });
            };
            reader.readAsDataURL(file);
          }),
      ),
    );
    setImages((current) => [...current, ...next]);
  }

  function toggleSidebar() {
    setSidebarOpen((value) => !value);
  }

  function toggleSettings() {
    setSettingsOpen((value) => !value);
  }

  function changeModel(model: string) {
    setSettings((current) => (current ? { ...current, defaultModel: model } : current));
  }

  function removeImage(index: number) {
    setImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  if (!workspace) {
    return (
      <main className="workspace-picker">
        <div className="picker-card">
          <div className="app-mark">
            <TerminalSquare size={22} />
          </div>
          <p className="eyebrow">CodeMap desktop</p>
          <h1>Open a workspace</h1>
          <p className="muted">
            Start a coding session with the same account, models, MCP servers,
            hooks, and settings as the CLI.
          </p>
          <button className="primary-button" onClick={openWorkspace} type="button">
            <FolderOpen size={16} />
            Choose folder
          </button>
        </div>
      </main>
    );
  }

  return (
    <div
      className={`app-shell ${sidebarOpen ? "" : "sidebar-closed"} ${settingsOpen ? "settings-open" : "settings-closed"}`}
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
        onToggleSidebar={toggleSidebar}
        onSelectThread={(threadId) => window.codemap.switchThread(threadId)}
        onCreateThread={createThread}
        onDeleteThread={deleteThread}
        onToggleThreadSelection={threadSelection.toggleSelection}
        onDeleteSelectedThreads={threadSelection.deleteSelected}
        onClearSelection={threadSelection.clearSelection}
        onOpenWorkspace={openWorkspace}
        onStartSidebarResize={startResize}
        onSetOpenThreadMenuId={setOpenThreadMenuId}
        openThreadMenuId={openThreadMenuId}
        lastSelectedThreadId={threadSelection.lastSelectedThreadId}
        onSetLastSelectedThreadId={threadSelection.setLastSelectedThreadId}
      />

      <section className="main-panel">
        <Topbar
          runtimeStatus={runtimeStatus}
          settings={settings}
          totalTokens={snapshot.usage.totalTokens}
          workspaceName={workspaceName}
          settingsOpen={settingsOpen}
          onToggleSidebar={toggleSidebar}
          onModelChange={changeModel}
          onToggleSettings={toggleSettings}
          onRestart={() => window.codemap.restartRuntime()}
        />

        <div className="workspace-body">
          <div className="conversation-column">
            <ConversationPanel
              displayMessages={displayMessages}
              snapshot={snapshot}
              error={error}
              isBusy={isBusy}
              onApprove={(id) => window.codemap.respondToApproval(id, "approve")}
              onDecline={(id) => window.codemap.respondToApproval(id, "decline")}
              onAnswerQuestion={(id, answer) => window.codemap.respondToQuestion(id, answer)}
            />

            <ComposerFooter
              images={images}
              draft={draft}
              runtimeStatus={runtimeStatus}
              isBusy={isBusy}
              onDraftChange={setDraft}
              onAttachImages={attachImages}
              onRemoveImage={removeImage}
              onSubmit={submit}
              onStop={() => window.codemap.abort()}
            />
          </div>

          <SettingsPanel
            settings={settings}
            open={settingsOpen}
            onToggle={toggleSettings}
          />
        </div>
      </section>
    </div>
  );
}
