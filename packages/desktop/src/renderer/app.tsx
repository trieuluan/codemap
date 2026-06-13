import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  CircleStop,
  EllipsisVertical,
  FileCode2,
  FolderOpen,
  ImagePlus,
  LoaderCircle,
  MessageSquarePlus,
  PanelLeft,
  Play,
  RefreshCw,
  Send,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import {
  createInitialSessionSnapshot,
  reduceAgentSessionEvent,
} from "@codemap-ai/core/agent/session";
import type {
  AgentSessionEvent,
  SessionMessage,
  SessionSnapshot,
  ThreadSummary,
} from "@codemap-ai/core/agent/contracts";
import type { SettingsMetadata } from "../shared/ipc.js";

type RuntimeStatus = "starting" | "ready" | "disconnected";
type LocalMessage = SessionMessage & { localId: string };
type ThreadSummaryWithMetadata = ThreadSummary & {
  metadata?: {
    mastra?: {
      om?: {
        threadTitle?: string;
      };
    };
  };
};

function getThreadDisplayTitle(thread: ThreadSummary): string {
  if (thread.title) return thread.title;
  const fallback = (thread as ThreadSummaryWithMetadata).metadata?.mastra?.om?.threadTitle;
  return fallback || "Untitled session";
}

export function App() {
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] =
    useState<RuntimeStatus>("disconnected");
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(
    createInitialSessionSnapshot(),
  );
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [settings, setSettings] = useState<SettingsMetadata | null>(null);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<Array<{ data: string; mimeType: string }>>(
    [],
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const [selectedThreadIds, setSelectedThreadIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const streamingRef = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const offAgent = window.codemap.onAgentEvent((event) => {
      setSnapshot((current) => reduceAgentSessionEvent(current, event));
      handleMessageEvent(event);
    });
    const offStatus = window.codemap.onRuntimeStatus((status) => {
      setRuntimeStatus(status);
      if (status === "ready") {
        void refreshMetadata();
      }
    });
    return () => {
      offAgent();
      offStatus();
    };
  }, []);

  const projectName = workspace?.split("/").filter(Boolean).at(-1) ?? "CodeMap";
  const isBusy =
    snapshot.status === "running" || snapshot.status === "aborting";
  const hasSelectedThreads = selectedThreadIds.length > 0;
  const displayMessages = useMemo(
    () => [
      ...messages,
      ...(snapshot.streamingText
        ? [
            {
              localId: "streaming",
              role: "assistant" as const,
              content: snapshot.streamingText,
            },
          ]
        : []),
    ],
    [messages, snapshot.streamingText],
  );

  function handleMessageEvent(event: AgentSessionEvent) {
    if (event.type === "token") {
      streamingRef.current += event.text;
      return;
    }
    if (event.type === "thread_change") {
      streamingRef.current = "";
      setMessages(
        event.messages.map((message, index) => ({
          ...message,
          localId: message.id ?? `thread-${index}`,
        })),
      );
      return;
    }
    if (
      event.type === "status" &&
      event.status === "idle" &&
      streamingRef.current
    ) {
      const content = streamingRef.current;
      streamingRef.current = "";
      setMessages((current) => [
        ...current,
        {
          localId: crypto.randomUUID(),
          role: "assistant",
          content,
        },
      ]);
      setSnapshot((current) => ({ ...current, streamingText: "" }));
    }
    if (event.type === "error") setError(event.message);
  }

  async function openWorkspace() {
    setError(null);
    const path = await window.codemap.openWorkspace();
    if (!path) return;
    setWorkspace(path);
    setMessages([]);
    setSnapshot(createInitialSessionSnapshot());
    await refreshMetadata();
  }

  async function refreshMetadata() {
    try {
      const [nextSettings, nextThreads] = await Promise.all([
        window.codemap.readSettings(),
        window.codemap.listThreads(),
      ]);
      setSettings(nextSettings);
      setThreads(nextThreads);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function submit() {
    const content = draft.trim();
    if (!content || !workspace || isBusy) return;
    setDraft("");
    setError(null);
    setMessages((current) => [
      ...current,
      {
        localId: crypto.randomUUID(),
        role: "user",
        content,
      },
    ]);
    setSnapshot((current) => ({
      ...current,
      streamingText: "",
      thinkingText: "",
      tools: [],
      error: null,
    }));
    streamingRef.current = "";
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

  async function selectThread(threadId: string) {
    await window.codemap.switchThread(threadId);
  }

  function toggleThreadSelection(threadId: string) {
    setSelectedThreadIds((current) =>
      current.includes(threadId)
        ? current.filter((id) => id !== threadId)
        : [...current, threadId],
    );
  }

  async function createThread() {
    await window.codemap.newThread();
    setMessages([]);
    setSnapshot(createInitialSessionSnapshot());
    await refreshMetadata();
  }

  async function deleteThread(threadId: string) {
    const confirmed = window.confirm("Delete this thread?");
    if (!confirmed) return;
    await removeThreads([threadId]);
  }

  async function removeThreads(threadIds: string[]) {
    if (threadIds.length === 0) return;
    setError(null);
    setOpenThreadMenuId(null);
    try {
      await Promise.all(threadIds.map((threadId) => window.codemap.deleteThread(threadId)));
      setSelectedThreadIds((current) =>
        current.filter((threadId) => !threadIds.includes(threadId)),
      );
      if (snapshot.threadId && threadIds.includes(snapshot.threadId)) {
        setMessages([]);
        setSnapshot(createInitialSessionSnapshot());
      }
      await refreshMetadata();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function deleteSelectedThreads() {
    if (!hasSelectedThreads) return;
    const confirmed = window.confirm(
      selectedThreadIds.length === 1
        ? "Delete the selected thread?"
        : `Delete ${selectedThreadIds.length} selected threads?`,
    );
    if (!confirmed) return;
    await removeThreads(selectedThreadIds);
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
          <button className="primary-button" onClick={openWorkspace}>
            <FolderOpen size={16} />
            Choose folder
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "sidebar-closed"}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <span className="eyebrow">Workspace</span>
            <strong title={workspace}>{projectName}</strong>
          </div>
          <div className="sidebar-header-actions">
            {hasSelectedThreads && (
              <button
                className="secondary-button danger-button"
                onClick={() => void deleteSelectedThreads()}
                title="Delete selected threads"
              >
                <Trash2 size={14} />
                Delete ({selectedThreadIds.length})
              </button>
            )}
            <button className="icon-button" onClick={createThread} title="New thread">
              <MessageSquarePlus size={16} />
            </button>
          </div>
        </div>
        <div className="thread-list">
          {threads.length === 0 ? (
            <p className="empty-note">No saved threads yet.</p>
          ) : (
            threads.map((thread) => {
              const isActive = snapshot.threadId === thread.id;
              const isMenuOpen = openThreadMenuId === thread.id;
              const isSelected = selectedThreadIds.includes(thread.id);
              return (
                <div
                  key={thread.id}
                  className={`thread-item ${isActive ? "active" : ""} ${isSelected ? "selected" : ""}`}
                  onMouseLeave={() => {
                    if (isMenuOpen) setOpenThreadMenuId(null);
                  }}
                >
                  <label
                    className="thread-select"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleThreadSelection(thread.id)}
                      aria-label={`Select ${getThreadDisplayTitle(thread)}`}
                    />
                  </label>
                  <button
                    className="thread-item-button"
                    onClick={() => selectThread(thread.id)}
                  >
                    <span>{getThreadDisplayTitle(thread)}</span>
                    <code>{thread.id.slice(0, 8)}</code>
                  </button>
                  <button
                    className={`thread-menu-trigger ${isMenuOpen ? "open" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenThreadMenuId((current) =>
                        current === thread.id ? null : thread.id,
                      );
                    }}
                    title="Thread actions"
                    aria-label={`Actions for ${getThreadDisplayTitle(thread)}`}
                  >
                    <EllipsisVertical size={14} />
                  </button>
                  {isMenuOpen && (
                    <div className="thread-menu">
                      <button
                        className="thread-menu-item danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteThread(thread.id);
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
        <div className="sidebar-footer">
          <button className="secondary-button" onClick={openWorkspace}>
            <FolderOpen size={15} />
            Change workspace
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button"
              onClick={() => setSidebarOpen((value) => !value)}
              title="Toggle sidebar"
            >
              <PanelLeft size={17} />
            </button>
            <div className={`status-dot ${runtimeStatus}`} />
            <span>{runtimeStatus}</span>
          </div>
          <div className="topbar-right">
            <label className="model-select">
              <Bot size={15} />
              <select
                value={settings?.defaultModel ?? "coder"}
                onChange={(event) =>
                  setSettings((current) =>
                    current
                      ? { ...current, defaultModel: event.target.value }
                      : current,
                  )
                }
              >
                {(settings?.availableModels.length
                  ? settings.availableModels
                  : [settings?.defaultModel ?? "coder"]
                ).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
            <code>{snapshot.usage.totalTokens.toLocaleString()} tokens</code>
            {runtimeStatus === "disconnected" && (
              <button
                className="secondary-button"
                onClick={() => window.codemap.restartRuntime()}
              >
                <RefreshCw size={14} />
                Restart
              </button>
            )}
          </div>
        </header>

        <div className="conversation">
          {displayMessages.length === 0 ? (
            <div className="empty-chat">
              <FileCode2 size={25} />
              <h2>What are we building?</h2>
              <p>
                Mention files with <code>@path/to/file</code>, attach images, or
                ask CodeMap to inspect and modify this workspace.
              </p>
            </div>
          ) : (
            displayMessages.map((message) => (
              <article
                key={message.localId}
                className={`message ${message.role}`}
              >
                <div className="message-role">
                  {message.role === "user" ? "You" : "CodeMap"}
                </div>
                <pre>{message.content}</pre>
              </article>
            ))
          )}

          {snapshot.thinkingText && isBusy && (
            <div className="thinking-row">
              <LoaderCircle className="spin" size={14} />
              Reasoning
            </div>
          )}

          {snapshot.tools.map((tool) => (
            <article className="tool-card" key={tool.toolCallId}>
              <div className="tool-header">
                <span>
                  {tool.result ? <Check size={14} /> : <Play size={14} />}
                  {tool.name}
                </span>
                <code>{tool.toolCallId.slice(0, 8)}</code>
              </div>
              {tool.preview && <pre className="diff-preview">{tool.preview}</pre>}
              {tool.result && <pre className="tool-result">{tool.result}</pre>}
            </article>
          ))}

          {snapshot.pendingApproval && (
            <section className="prompt-card">
              <strong>Allow {snapshot.pendingApproval.toolName}?</strong>
              <pre>{JSON.stringify(snapshot.pendingApproval.args, null, 2)}</pre>
              <div className="prompt-actions">
                <button
                  className="primary-button"
                  onClick={() =>
                    window.codemap.respondToApproval(
                      snapshot.pendingApproval!.approvalId,
                      "approve",
                    )
                  }
                >
                  Approve
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    window.codemap.respondToApproval(
                      snapshot.pendingApproval!.approvalId,
                      "decline",
                    )
                  }
                >
                  Decline
                </button>
              </div>
            </section>
          )}

          {snapshot.pendingQuestion && (
            <section className="prompt-card">
              <strong>{snapshot.pendingQuestion.question}</strong>
              <div className="prompt-actions">
                {(snapshot.pendingQuestion.options ?? []).map((option) => (
                  <button
                    key={option.label}
                    className="secondary-button"
                    onClick={() =>
                      window.codemap.respondToQuestion(
                        snapshot.pendingQuestion!.questionId,
                        option.value ?? option.label,
                      )
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {error && (
            <div className="error-banner">
              <X size={15} />
              {error}
            </div>
          )}
        </div>

        <footer className="composer-wrap">
          {images.length > 0 && (
            <div className="attachment-row">
              {images.map((_, index) => (
                <span key={index}>
                  Image {index + 1}
                  <button
                    onClick={() =>
                      setImages((current) =>
                        current.filter((__, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="composer">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ask CodeMap to inspect, explain, or change this workspace"
              disabled={runtimeStatus !== "ready"}
            />
            <div className="composer-actions">
              <input
                ref={fileInput}
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => void attachImages(event.target.files)}
              />
              <button
                className="icon-button"
                onClick={() => fileInput.current?.click()}
                title="Attach image"
              >
                <ImagePlus size={17} />
              </button>
              {isBusy ? (
                <button className="stop-button" onClick={() => window.codemap.abort()}>
                  <CircleStop size={16} />
                  Stop
                </button>
              ) : (
                <button
                  className="send-button"
                  disabled={!draft.trim() || runtimeStatus !== "ready"}
                  onClick={() => void submit()}
                >
                  <Send size={16} />
                  Send
                </button>
              )}
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
