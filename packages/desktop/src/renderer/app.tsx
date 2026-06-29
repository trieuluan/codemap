import { useEffect, useRef, useState } from "react";
import { Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
import type { SettingsMetadata } from "../shared/ipc.js";
import type { RuntimeStatus } from "./types.js";
import { Topbar } from "./components/Topbar.js";
import { Launcher, type RecentWorkspace } from "./components/Launcher.js";
import { ChatPage } from "./pages/ChatPage.js";
import { MapPage } from "./pages/MapPage.js";
import { AccountPage } from "./pages/AccountPage.js";
import McpDetailPage from "./pages/McpDetailPage.js";

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"build" | "plan" | "fast">("build");
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("disconnected");
  const [settings, setSettings] = useState<SettingsMetadata | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [recents, setRecents] = useState<RecentWorkspace[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("codemap.recentWorkspaces") ?? "[]");
    } catch {
      return [];
    }
  });
  const [openingWorkspace, setOpeningWorkspace] = useState<string | null>(null);
  const [workspaceOpenError, setWorkspaceOpenError] = useState<string | null>(null);
  const openingWorkspaceRef = useRef(false);

  useEffect(() => {
    return window.codemap.onRuntimeStatus((status) => {
      setRuntimeStatus(status);
      if (status === "ready") void refreshSettings();
    });
  }, []);

  async function refreshSettings() {
    try {
      setSettings(await window.codemap.readSettings());
    } catch {
      // non-critical
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
    } catch (cause) {
      setWorkspaceOpenError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      openingWorkspaceRef.current = false;
      setOpeningWorkspace(null);
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

  function toggleSidebar() { setSidebarOpen((v) => !v); }

  const sharedTopbarProps = {
    runtimeStatus,
    workspace,
    recents,
    mode,
    onModeChange: setMode,
    onToggleSidebar: toggleSidebar,
    onRestart: () => window.codemap.restartRuntime(),
    onSwitchWorkspace: (path: string) => void openWorkspace(path),
    onOpenWorkspace: () => void openWorkspace(),
    onOpenLauncher: () => setWorkspace(null),
  };

  const isAccountRoute = location.pathname.startsWith("/account");
  const isMapRoute = location.pathname === "/map";
  const chatPageProps = {
    workspace,
    runtimeStatus,
    mode,
    settings,
    sidebarOpen,
    onToggleSidebar: toggleSidebar,
    onModeChange: setMode,
    onModelChange: (model: string) =>
      setSettings((s) => (s ? { ...s, defaultModel: model } : s)),
    onThreadsRefresh: refreshSettings,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Single persistent Topbar — never unmounts, no layout shift on route change */}
      <Topbar {...sharedTopbarProps} />

      {/* ChatPage stays mounted at all times — hidden via CSS when not on /chat */}
      <div style={isAccountRoute || isMapRoute ? { display: "none" } : { flex: 1, minHeight: 0 }}>
        <ChatPage {...chatPageProps} />
      </div>

      {isMapRoute && <MapPage workspacePath={workspace} />}

      {isAccountRoute && (
        <div className="workspace-body workspace-body-account">
          <Routes>
            <Route path="/account" element={<Navigate to="/account/identity" replace />} />
            <Route path="/account/mcp/:server" element={<McpDetailPage />} />
            <Route path="/account/:section" element={<AccountPage />} />
          </Routes>
        </div>
      )}

      {/* Catch-all redirect for unknown routes */}
      {!isAccountRoute && !isMapRoute && location.pathname !== "/chat" && (
        <Routes>
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      )}
    </div>
  );
}
