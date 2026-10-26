import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Files, GitCompareArrows, MessageSquare, Network, Settings, X } from "lucide-react";
import type { IndexStatus, SettingsMetadata } from "../shared/ipc.js";
import type { RuntimeStatus } from "./types.js";
import { Topbar } from "./components/Topbar.js";
import { ChatPage } from "./pages/ChatPage.js";
import { MapPage } from "./pages/MapPage.js";
import { defaultGraphFilters, type GraphFilters } from "./components/graph-view.js";
import { MapFileSidebar } from "./components/MapFileSidebar.js";
import { WorkingDiffPanel } from "./components/WorkingDiffPanel.js";
import { AccountPage } from "./pages/AccountPage.js";
import McpDetailPage from "./pages/McpDetailPage.js";

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"build" | "plan" | "fast">("build");
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("starting");
  const [index, setIndex] = useState<IndexStatus | null>(null);
  const [settings, setSettings] = useState<SettingsMetadata | null>(null);
  const [explorerOpen, setExplorerOpen] = useState(() => window.innerWidth > 760);
  const [threadSidebarOpen, setThreadSidebarOpen] = useState(false);
  const [graphFilters, setGraphFilters] = useState<GraphFilters>(defaultGraphFilters);
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  async function refreshSettings() {
    try { setSettings(await window.codemap.readSettings()); } catch { /* Runtime may still be starting. */ }
  }
  async function connect() {
    setError(null);
    try {
      const data = await window.codemap.bootstrap();
      setWorkspace(data.workspacePath);
      setSettings(data.settings);
      setRuntimeStatus(data.status);
      if (data.index) setIndex(data.index);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  useEffect(() => {
    void connect();
    const offStatus = window.codemap.onRuntimeStatus(status => {
      setRuntimeStatus(status);
      if (status === "ready") void refreshSettings();
    });
    const offIndex = window.codemap.onIndexStatus(setIndex);
    return () => { offStatus(); offIndex(); };
  }, []);
  useEffect(() => {
    const selected = (event: Event) => setSelectedPath((event as CustomEvent<{ path: string }>).detail.path);
    const source = () => navigate("/map");
    const ask = () => { setThreadSidebarOpen(false); window.dispatchEvent(new Event("codemap-close-source")); navigate("/chat"); };
    window.addEventListener("codemap-selected-node", selected);
    window.addEventListener("codemap-source-open", source);
    window.addEventListener("codemap-ask-file", ask);
    return () => {
      window.removeEventListener("codemap-selected-node", selected);
      window.removeEventListener("codemap-source-open", source);
      window.removeEventListener("codemap-ask-file", ask);
    };
  }, [navigate]);
  useEffect(() => {
    if (location.pathname === "/chat") window.dispatchEvent(new Event("codemap-close-source"));
  }, [location.pathname]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "Escape") {
        if (window.innerWidth <= 760) setExplorerOpen(false);
        if (location.pathname === "/chat") navigate("/map");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [location.pathname, navigate]);
  function changeGraphFilters(filters: GraphFilters) {
    setGraphFilters(filters);
    window.dispatchEvent(new Event("codemap-fit-graph"));
  }
  function selectFile(path: string) {
    setSelectedPath(path);
    setQuery("");
    setGraphFilters(defaultGraphFilters);
    navigate("/map");
    window.dispatchEvent(new CustomEvent("codemap-focus-file", { detail: { path } }));
    if (window.innerWidth <= 760) setExplorerOpen(false);
  }
  async function restart() {
    try { await window.codemap.restartRuntime(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  const isAccount = location.pathname.startsWith("/account");
  const isMap = location.pathname === "/map";
  const isChanges = location.pathname === "/changes";
  const isChat = location.pathname === "/chat";
  if (!workspace) return <main className="web-connect" aria-live="polite">
    <span className="web-wordmark">CodeMap</span><h1>{error ? "Unable to connect" : "Opening your workspace"}</h1>
    <p>{error ?? "Connecting to the local server…"}</p>
    {error && <button className="secondary-button" onClick={() => void connect()}>Retry connection</button>}
  </main>;
  return <div className={`web-workspace focus-workspace focus-shell ${explorerOpen ? "focus-explorer-open" : ""}`}>
    <Topbar runtimeStatus={runtimeStatus} workspace={workspace} mode={mode} index={index} searchQuery={query} searchRef={searchRef}
      onSearchChange={value => { setQuery(value); if (value) { setExplorerOpen(true); navigate("/map"); } }}
      onModeChange={setMode} onToggleSidebar={() => setExplorerOpen(value => !value)} onRestart={() => void restart()} />
    {error && <div className="web-status-banner" role="alert">{error}<button onClick={() => setError(null)} aria-label="Dismiss error">×</button></div>}
    {runtimeStatus === "disconnected" && <div className="web-status-banner" role="status">Connection interrupted. Reconnecting automatically; unsent work stays in this browser.</div>}
    <div className="focus-workbench">
      <nav className="focus-activity" aria-label="Workspace views">
        <button className={isMap ? "active" : ""} title="Code graph" aria-label="Code graph" aria-current={isMap ? "page" : undefined} onClick={() => navigate("/map")}><Network size={19} /></button>
        <button className={explorerOpen ? "active" : ""} title="Toggle file explorer" aria-label="Toggle file explorer" aria-expanded={explorerOpen} onClick={() => setExplorerOpen(value => !value)}><Files size={18} /></button>
        <button className={isChanges ? "active" : ""} title="Working changes" aria-label="Working changes" aria-current={isChanges ? "page" : undefined} onClick={() => navigate("/changes")}><GitCompareArrows size={19} /></button>
        <button className={isChat ? "active" : ""} title="Agent chat" aria-label="Agent chat" aria-expanded={isChat} onClick={() => navigate(isChat ? "/map" : "/chat")}><MessageSquare size={18} /></button>
        <button className={`focus-activity-account ${isAccount ? "active" : ""}`} title="Account and settings" aria-label="Account and settings" onClick={() => navigate("/account/identity")}><Settings size={18} /></button>
      </nav>
      {explorerOpen && <button className="focus-explorer-scrim" aria-label="Close file explorer" onClick={() => setExplorerOpen(false)} />}
      <aside className="focus-explorer" aria-label="File explorer" hidden={!explorerOpen} style={explorerOpen ? undefined : { display: "none" }}>
          <div className="focus-panel-heading"><span>EXPLORER</span><button className="focus-icon" title="Collapse explorer" aria-label="Collapse explorer" onClick={() => setExplorerOpen(false)}><X size={14} /></button></div>
          <div className="focus-explorer-project" title={workspace}>{workspace.split(/[\\/]/).filter(Boolean).at(-1)}</div>
          <MapFileSidebar onSelectFile={selectFile} selectedPath={selectedPath} searchQuery={query} filters={graphFilters} onFiltersChange={changeGraphFilters} />
          <div className="focus-local-note"><i />Local workspace</div>
      </aside>
      <div className="focus-stage">
        <div className="focus-graph-view" style={isMap || isChat ? undefined : { display: "none" }}><MapPage active={isMap || isChat} workspacePath={workspace} sidebarOpen={false} externalSidebar externalQuery={query} filters={graphFilters} onFiltersChange={changeGraphFilters} /></div>
        {isChanges && <main className="web-changes focus-changes"><WorkingDiffPanel /></main>}
        {isAccount && <div className="workspace-body workspace-body-account"><Routes>
          <Route path="/account" element={<Navigate to="/account/identity" replace />} />
          <Route path="/account/mcp/:server" element={<McpDetailPage />} />
          <Route path="/account/:section" element={<AccountPage />} />
        </Routes></div>}
        {!isAccount && !isMap && !isChat && !isChanges && <Navigate to="/map" replace />}
      </div>
      <aside className="focus-agent-dock" aria-label="Agent chat panel" style={isChat ? undefined : { display: "none" }}>
        <div className="focus-panel-heading"><span><MessageSquare size={14} />Agent</span><button className="focus-icon" aria-label="Close agent chat" title="Close agent chat" onClick={() => navigate("/map")}><X size={15} /></button></div>
        <ChatPage compact workspace={workspace} runtimeStatus={runtimeStatus} mode={mode} settings={settings} active={isChat}
          sidebarOpen={threadSidebarOpen} onToggleSidebar={() => setThreadSidebarOpen(value => !value)} onModeChange={setMode}
          onModelChange={model => setSettings(current => current ? { ...current, defaultModel: model } : current)} onThreadsRefresh={refreshSettings} />
      </aside>
    </div>
  </div>;
}
