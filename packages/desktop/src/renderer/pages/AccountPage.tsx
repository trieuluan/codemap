import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  User,
  Link2,
  Server,
  Brain,
  RefreshCw,
  LogIn,
  LogOut,
  Shield,
  Cloud,
  GitBranch,
  ExternalLink,
  ChevronRight,
  XCircle,
  Loader,
  ArrowLeft,
} from "lucide-react";
import type {
  AccountInfo,
  McpStatusResult,
} from "../../shared/ipc.js";

type AccountSection = "identity" | "all-projects" | "projects" | "mcp" | "memory";

const NAV_ITEMS: { id: AccountSection; label: string; icon: React.ReactNode }[] = [
  { id: "identity",     label: "Identity",       icon: <User size={15} /> },
  { id: "all-projects", label: "Projects",        icon: <Cloud size={15} /> },
  { id: "projects",     label: "Linked Project",  icon: <Link2 size={15} /> },
  { id: "mcp",          label: "MCP Servers",     icon: <Server size={15} /> },
  { id: "memory",       label: "Memory",          icon: <Brain size={15} /> },
];

const SECTION_FROM_HASH: Record<string, AccountSection> = {
  "#/account/identity":     "identity",
  "#/account/all-projects": "all-projects",
  "#/account/projects":     "projects",
  "#/account/mcp":          "mcp",
  "#/account/memory":       "memory",
};

export function AccountPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const sectionKey = `#/account${location.pathname.replace("/account", "") || "/identity"}`;
  const activeSection: AccountSection = SECTION_FROM_HASH[sectionKey] ?? "identity";

  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; status: string; repoUrl?: string }[]>([]);
  const [allProjectsError, setAllProjectsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string; repoUrl?: string }[]>([]);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProjectError(null);
    setAllProjectsError(null);
    try {
      const [info, proj, mcp] = await Promise.all([
        window.codemap.getAccountInfo().catch(() => null),
        window.codemap.listProjects().catch(() => null),
        window.codemap.getMcpStatus().catch(() => null),
      ]);
      setAccountInfo(info);
      setAllProjects(proj?.projects ?? []);
      if (proj?.error) setAllProjectsError(proj.error);
      setProjects(proj?.projects ?? []);
      if (proj?.error) setProjectError(proj.error);
      setMcpStatus(mcp);
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
            {activeSection === "all-projects" && (
              <AllProjectsSection
                projects={allProjects}
                error={allProjectsError}
                actionLoading={actionLoading}
                onLink={() => void handleLinkProject()}
              />
            )}
            {activeSection === "projects" && (
              <ProjectsSection
                projects={projects}
                error={projectError}
                actionLoading={actionLoading}
                onLink={() => void handleLinkProject()}
              />
            )}
            {activeSection === "mcp" && <McpSection mcp={mcpStatus} onRefresh={() => void loadAll()} />}
            {activeSection === "memory" && <MemorySection />}
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

/* ─── Section: All Projects ─── */
function AllProjectsSection({
  projects,
  error,
  actionLoading,
  onLink,
}: {
  projects: { id: string; name: string; status: string; repoUrl?: string }[];
  error?: string | null;
  actionLoading: string | null;
  onLink: () => void;
}) {
  return (
    <div className="account-section">
      <div className="account-section-toprow">
        <div>
          <h2 className="account-section-heading">Projects</h2>
          <p className="account-section-desc">All cloud projects in your CodeMap account.</p>
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

      {error && <div className="account-error">{error}</div>}

      {!error && projects.length === 0 ? (
        <div className="account-empty-state">
          <Cloud size={28} />
          <p>No projects yet</p>
          <p className="account-empty-hint">
            Create a project at{" "}
            <a
              href="#"
              className="account-ext-link-inline"
              onClick={(e) => {
                e.preventDefault();
                void window.codemap.openUrl("https://codemap.ai/projects");
              }}
            >
              codemap.ai/projects
            </a>
          </p>
        </div>
      ) : !error ? (
        <ul className="account-list">
          {projects.map((p) => (
            <li key={p.id} className="account-list-item">
              <Cloud size={15} className="muted" />
              <div className="account-list-item-info">
                <span className="account-list-item-name">{p.name}</span>
                {p.repoUrl && <span className="account-list-item-sub">{p.repoUrl}</span>}
              </div>
              <span className={`account-project-badge account-project-badge--${p.status}`}>
                {p.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ─── Section: Projects ─── */
function ProjectsSection({
  projects,
  error,
  actionLoading,
  onLink,
}: {
  projects: { id: string; name: string; repoUrl?: string }[];
  error?: string | null;
  actionLoading: string | null;
  onLink: () => void;
}) {
  return (
    <div className="account-section">
      <div className="account-section-toprow">
        <div>
          <h2 className="account-section-heading">Linked Project</h2>
          <p className="account-section-desc">Cloud project linked to this workspace.</p>
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

      {error && (
        <div className="account-error">{error}</div>
      )}

      {!error && projects.length === 0 ? (
        <div className="account-empty-state">
          <GitBranch size={28} />
          <p>No linked projects yet</p>
        </div>
      ) : !error ? (
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
      ) : null}
    </div>
  );
}

/* ─── Section: MCP ─── */
function McpSection({
  mcp,
  onRefresh,
}: {
  mcp: McpStatusResult | null;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="account-section mcp-section">
      <div className="account-section-toprow">
        <div>
          <h2 className="account-section-heading">MCP Servers</h2>
          <p className="account-section-desc">
            {mcp?.statuses?.length ?? 0} server{(mcp?.statuses?.length ?? 0) !== 1 ? "s" : ""} connected · {mcp?.statuses?.reduce((n, s) => n + (s.toolCount ?? 0), 0) ?? 0} tools available
          </p>
        </div>
        <button className="icon-button" onClick={onRefresh} type="button" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {!mcp || !mcp.hasServers ? (
        <div className="account-empty-state">
          <Server size={28} />
          <p>No MCP servers configured</p>
          <p className="account-empty-hint">Add MCP servers in your .codemap/settings.json</p>
        </div>
      ) : (
        <div className="mcp-servers">
          {mcp.statuses.map((s) => (
            <button
              key={s.name}
              className="mcp-server-card mcp-server-card-clickable"
              onClick={() => navigate(`/account/mcp/${s.name}`)}
              type="button"
            >
              <div className="mcp-server-status-dot" data-status={s.connected ? "connected" : s.connecting ? "connecting" : "error"} />
              <div className="mcp-server-info">
                <span className="mcp-server-name">{s.name}</span>
                <span className="mcp-server-meta">
                  {s.transport === "stdio" ? "⚙" : "🌐"} {s.transport}
                  <span className="mcp-sep">·</span>
                  <span className="mcp-tool-count">{s.toolCount} tool{s.toolCount !== 1 ? "s" : ""}</span>
                  {s.error && <><span className="mcp-sep">·</span><span className="text-error">{s.error}</span></>}
                </span>
              </div>
              <span className={`mcp-badge ${s.connected ? "mcp-badge-ok" : s.connecting ? "mcp-badge-warn" : "mcp-badge-err"}`}>
                {s.connected ? "Connected" : s.connecting ? "Connecting…" : "Disconnected"}
              </span>
              <ChevronRight size={14} className="mcp-chevron" />
            </button>
          ))}
          {mcp.skipped.length > 0 && (
            <div className="mcp-skipped-section">
              <span className="mcp-skipped-label">Skipped</span>
              {mcp.skipped.map((s) => (
                <div key={s.name} className="mcp-skipped-item">
                  <XCircle size={13} className="text-error" />
                  <span className="mcp-skipped-name">{s.name}</span>
                  <span className="mcp-skipped-reason">{s.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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


