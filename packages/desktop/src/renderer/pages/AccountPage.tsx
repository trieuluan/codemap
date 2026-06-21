import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  User,
  Link2,
  Server,
  Brain,
  Settings,
  RefreshCw,
  LogIn,
  LogOut,
  Shield,
  Cloud,
  GitBranch,
  ExternalLink,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader,
  ArrowLeft,
} from "lucide-react";
import type {
  AccountInfo,
  SettingsMetadata,
  McpStatusResult,
} from "../../shared/ipc.js";

type AccountSection = "identity" | "projects" | "mcp" | "memory" | "settings";

const NAV_ITEMS: { id: AccountSection; label: string; icon: React.ReactNode }[] = [
  { id: "identity", label: "Identity", icon: <User size={15} /> },
  { id: "projects", label: "Linked Projects", icon: <Link2 size={15} /> },
  { id: "mcp", label: "MCP Servers", icon: <Server size={15} /> },
  { id: "memory", label: "Memory", icon: <Brain size={15} /> },
  { id: "settings", label: "Settings", icon: <Settings size={15} /> },
];

const SECTION_FROM_HASH: Record<string, AccountSection> = {
  "#/account/identity": "identity",
  "#/account/projects": "projects",
  "#/account/mcp": "mcp",
  "#/account/memory": "memory",
  "#/account/settings": "settings",
};

export function AccountPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const sectionKey = `#/account${location.pathname.replace("/account", "") || "/identity"}`;
  const activeSection: AccountSection = SECTION_FROM_HASH[sectionKey] ?? "identity";

  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string; repoUrl?: string }[]>([]);
  const [mcpStatus, setMcpStatus] = useState<McpStatusResult | null>(null);
  const [settings, setSettings] = useState<SettingsMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [info, proj, mcp, cfg] = await Promise.all([
        window.codemap.getAccountInfo().catch(() => null),
        window.codemap.listProjects().catch(() => null),
        window.codemap.getMcpStatus().catch(() => null),
        window.codemap.readSettings().catch(() => null),
      ]);
      setAccountInfo(info);
      setProjects(proj?.projects ?? []);
      setMcpStatus(mcp);
      setSettings(cfg);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function goTo(section: AccountSection) {
    navigate(`/account/${section}`);
  }

  async function handleLogin() {
    setActionLoading("login");
    try {
      const result = await window.codemap.accountLogin();
      if (result?.success) await loadAll();
      else if (result?.error) setError(result.error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLogout() {
    setActionLoading("logout");
    try {
      await window.codemap.accountLogout();
      setAccountInfo({ loggedIn: false });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLinkProject() {
    setActionLoading("link");
    try {
      const result = await window.codemap.linkProject("");
      if (result?.success) {
        const proj = await window.codemap.listProjects().catch(() => null);
        setProjects(proj?.projects ?? []);
      } else if (result?.error) setError(result.error);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="account-page">
      {/* Sidebar nav */}
      <aside className="account-sidebar">
        <div className="account-sidebar-header">
          <button
            className="account-back-btn"
            onClick={() => navigate("/chat")}
            type="button"
            title="Back to chat"
          >
            <ArrowLeft size={15} />
          </button>
          <span className="account-sidebar-title">Account</span>
        </div>

        <nav className="account-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`account-nav-item ${activeSection === item.id ? "active" : ""}`}
              onClick={() => goTo(item.id)}
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="account-sidebar-footer">
          <a
            className="account-ext-link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              void window.codemap.openUrl("https://codemap.ai/account");
            }}
          >
            <ExternalLink size={12} />
            codemap.ai
          </a>
        </div>
      </aside>

      {/* Content */}
      <main className="account-content">
        {loading ? (
          <div className="account-loading">
            <RefreshCw size={18} className="spin" />
            <span>Loading…</span>
          </div>
        ) : error ? (
          <div className="account-error">
            <p>{error}</p>
            <button className="secondary-button" onClick={() => void loadAll()} type="button">
              Retry
            </button>
          </div>
        ) : (
          <>
            {activeSection === "identity" && (
              <IdentitySection
                accountInfo={accountInfo}
                actionLoading={actionLoading}
                onLogin={() => void handleLogin()}
                onLogout={() => void handleLogout()}
              />
            )}
            {activeSection === "projects" && (
              <ProjectsSection
                projects={projects}
                actionLoading={actionLoading}
                onLink={() => void handleLinkProject()}
              />
            )}
            {activeSection === "mcp" && <McpSection mcp={mcpStatus} onRefresh={() => void loadAll()} />}
            {activeSection === "memory" && <MemorySection />}
            {activeSection === "settings" && <SettingsSection settings={settings} onSaved={() => void loadAll()} />}
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Section: Identity ─── */
function IdentitySection({
  accountInfo,
  actionLoading,
  onLogin,
  onLogout,
}: {
  accountInfo: AccountInfo | null;
  actionLoading: string | null;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="account-section">
      <h2 className="account-section-heading">Identity</h2>
      <p className="account-section-desc">Your CodeMap account and authentication status.</p>

      {accountInfo?.loggedIn && accountInfo.user ? (
        <div className="account-identity-card">
          <div className="account-avatar">
            {(accountInfo.user.name ?? accountInfo.user.email ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="account-identity-info">
            <span className="account-name">{accountInfo.user.name ?? accountInfo.user.email}</span>
            {accountInfo.user.email && accountInfo.user.name && (
              <span className="account-email">{accountInfo.user.email}</span>
            )}
            {accountInfo.apiUrl && <span className="account-api-url">{accountInfo.apiUrl}</span>}
          </div>
          <button
            className="secondary-button"
            onClick={onLogout}
            disabled={actionLoading === "logout"}
            type="button"
          >
            {actionLoading === "logout" ? <Loader size={13} className="spin" /> : <LogOut size={13} />}
            Sign out
          </button>
        </div>
      ) : (
        <div className="account-signed-out">
          <Shield size={36} className="account-signed-out-icon" />
          <h3>Not signed in</h3>
          <p>Sign in to sync projects, access cloud features, and manage your settings.</p>
          <button
            className="primary-button"
            onClick={onLogin}
            disabled={actionLoading === "login"}
            type="button"
          >
            {actionLoading === "login" ? <Loader size={13} className="spin" /> : <LogIn size={13} />}
            Sign in to CodeMap
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Section: Projects ─── */
function ProjectsSection({
  projects,
  actionLoading,
  onLink,
}: {
  projects: { id: string; name: string; repoUrl?: string }[];
  actionLoading: string | null;
  onLink: () => void;
}) {
  return (
    <div className="account-section">
      <div className="account-section-toprow">
        <div>
          <h2 className="account-section-heading">Linked Projects</h2>
          <p className="account-section-desc">Cloud projects linked to this workspace.</p>
        </div>
        <button
          className="secondary-button"
          onClick={onLink}
          disabled={actionLoading === "link"}
          type="button"
        >
          {actionLoading === "link" ? <Loader size={13} className="spin" /> : <Link2 size={13} />}
          Link project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="account-empty-state">
          <GitBranch size={28} />
          <p>No linked projects yet</p>
        </div>
      ) : (
        <ul className="account-list">
          {projects.map((p) => (
            <li key={p.id} className="account-list-item">
              <Cloud size={15} className="muted" />
              <div className="account-list-item-info">
                <span className="account-list-item-name">{p.name}</span>
                {p.repoUrl && <span className="account-list-item-sub">{p.repoUrl}</span>}
              </div>
              <ChevronRight size={14} className="muted" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Section: MCP ─── */
function McpSection({ mcp, onRefresh }: { mcp: McpStatusResult | null; onRefresh: () => void }) {
  return (
    <div className="account-section">
      <div className="account-section-toprow">
        <div>
          <h2 className="account-section-heading">MCP Servers</h2>
          <p className="account-section-desc">Model Context Protocol server connections.</p>
        </div>
        <button className="icon-button" onClick={onRefresh} type="button" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {!mcp || !mcp.hasServers ? (
        <div className="account-empty-state">
          <Server size={28} />
          <p>No MCP servers configured</p>
        </div>
      ) : (
        <ul className="account-list">
          {mcp.statuses.map((s) => (
            <li key={s.name} className="account-list-item">
              {s.connected ? (
                <CheckCircle size={15} className="text-success" />
              ) : s.connecting ? (
                <Loader size={15} className="spin muted" />
              ) : (
                <XCircle size={15} className="text-error" />
              )}
              <div className="account-list-item-info">
                <span className="account-list-item-name">{s.name}</span>
                <span className="account-list-item-sub">
                  {s.transport} · {s.toolCount} tool{s.toolCount !== 1 ? "s" : ""}
                  {s.error ? ` · ${s.error}` : ""}
                </span>
              </div>
              <span className={`account-badge ${s.connected ? "badge-ok" : "badge-err"}`}>
                {s.connected ? "Connected" : s.connecting ? "Connecting" : "Disconnected"}
              </span>
            </li>
          ))}
          {mcp.skipped.length > 0 && (
            <>
              <li className="account-list-divider">Skipped</li>
              {mcp.skipped.map((s) => (
                <li key={s.name} className="account-list-item muted">
                  <XCircle size={15} />
                  <div className="account-list-item-info">
                    <span className="account-list-item-name">{s.name}</span>
                    <span className="account-list-item-sub">{s.reason}</span>
                  </div>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

/* ─── Section: Memory ─── */
function MemorySection() {
  const [memory, setMemory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load memory from agent session snapshot if available
    setLoading(false);
    setMemory(null);
  }, []);

  return (
    <div className="account-section">
      <h2 className="account-section-heading">Memory</h2>
      <p className="account-section-desc">Working memory persisted across agent sessions.</p>

      {loading ? (
        <div className="account-loading"><RefreshCw size={16} className="spin" /></div>
      ) : memory ? (
        <pre className="account-memory-block">{memory}</pre>
      ) : (
        <div className="account-empty-state">
          <Brain size={28} />
          <p>No memory stored yet</p>
          <p className="account-empty-hint">Memory is written by the agent during sessions and persisted in your workspace.</p>
        </div>
      )}
    </div>
  );
}

/* ─── Section: Settings ─── */
function SettingsSection({
  settings,
  onSaved,
}: {
  settings: SettingsMetadata | null;
  onSaved: () => void;
}) {
  return (
    <div className="account-section">
      <h2 className="account-section-heading">Settings</h2>
      <p className="account-section-desc">Model, gateway, and agent configuration.</p>

      <div className="account-settings-group">
        <div className="account-settings-row">
          <label className="account-settings-label">Default model</label>
          <span className="account-settings-value">{settings?.defaultModel ?? "—"}</span>
        </div>
        <div className="account-settings-row">
          <label className="account-settings-label">Gateway</label>
          <span className="account-settings-value">{settings?.baseUrl ?? "—"}</span>
        </div>
        <div className="account-settings-row">
          <label className="account-settings-label">API key</label>
          <span className={`account-settings-value ${settings?.hasApiKey ? "text-success" : "muted"}`}>
            {settings?.hasApiKey ? "✓ Set" : "Not configured"}
          </span>
        </div>
        <div className="account-settings-row">
          <label className="account-settings-label">API token</label>
          <span className={`account-settings-value ${settings?.hasApiToken ? "text-success" : "muted"}`}>
            {settings?.hasApiToken ? "✓ Set" : "Not configured"}
          </span>
        </div>
        <div className="account-settings-row">
          <label className="account-settings-label">Provider</label>
          <span className="account-settings-value">{settings?.provider ?? "—"}</span>
        </div>
      </div>

      <p className="account-settings-hint">
        Edit <code>.codemap/settings.json</code> in your workspace to change these values.
      </p>
    </div>
  );
}
