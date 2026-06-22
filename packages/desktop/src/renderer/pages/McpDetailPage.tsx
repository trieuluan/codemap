import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Server,
} from "lucide-react";
import type {
  McpServerStatus,
  McpSkippedServer,
} from "../../shared/ipc.js";

interface McpData {
  statuses: McpServerStatus[];
  skipped: McpSkippedServer[];
}



export default function McpDetailPage() {
  const { server } = useParams<{ server: string }>();
  const navigate = useNavigate();
  const [mcp, setMcp] = useState<McpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const result = await window.codemap.getMcpStatus();
      setMcp(result ? { statuses: result.statuses, skipped: result.skipped } : null);

      // If toolDetails is empty, try getToolsList() as fallback (toolClient may not have been ready)
      if (result) {
        const target = result.statuses.find((s) => s.name === server);
        if (target && (!target.toolDetails || target.toolDetails.length === 0)) {
          try {
            const toolsList = await window.codemap.getToolsList();
            if (toolsList && toolsList.groupedByServer[server ?? ""]) {
              const enriched = result.statuses.map((s) =>
                s.name === server
                  ? { ...s, toolDetails: (toolsList.groupedByServer[s.name] ?? []).map((t) => ({ name: t.name, description: t.description ?? "" })) }
                  : s,
              );
              setMcp({ statuses: enriched, skipped: result.skipped });
            }
          } catch {
            // getToolsList failed — toolClient still not ready, that's ok
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const target = mcp?.statuses.find((s) => s.name === server);
  const tools = target?.toolDetails ?? [];

  const filtered = tools.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()),
  );

  const totalTools = mcp?.statuses.reduce((n, s) => n + (s.toolCount ?? 0), 0) ?? 0;
  const totalServers = mcp?.statuses.length ?? 0;

  return (
    <div className="mcp-detail-page">
      {/* Header */}
      <div className="mcp-detail-header">
        <button
          className="mcp-detail-back"
          onClick={() => navigate("/account/mcp")}
          type="button"
        >
          <ArrowLeft size={15} />
          <span>MCP Servers</span>
        </button>
        <span className="mcp-detail-breadcrumb-sep">›</span>
        <span className="mcp-detail-server-name">{server}</span>
        <span className="mcp-detail-summary">
          {totalServers} server{totalServers !== 1 ? "s" : ""} · {totalTools} tools
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="mcp-detail-loading">
          <RefreshCw size={18} className="spin" />
          <span>Loading…</span>
        </div>
      ) : !target ? (
        <div className="mcp-detail-empty">
          <Server size={28} />
          <p>Server not found</p>
        </div>
      ) : (
        <>
          {/* Server info card */}
          <div className="mcp-detail-server-card">
            <div className="mcp-detail-server-status">
              <span
                className="mcp-detail-status-dot"
                data-status={target.connected ? "connected" : target.connecting ? "connecting" : "error"}
              />
              <span className="mcp-detail-status-text">
                {target.connected ? "Connected" : target.connecting ? "Connecting…" : "Disconnected"}
              </span>
            </div>
            <div className="mcp-detail-server-meta">
              <span className="mcp-detail-meta-item">
                {target.transport === "stdio" ? "⚙" : "🌐"} {target.transport}
              </span>
              <span className="mcp-detail-meta-sep">·</span>
              <span className="mcp-detail-meta-item">
                {tools.length} tool{tools.length !== 1 ? "s" : ""}
              </span>
              {target.error && (
                <>
                  <span className="mcp-detail-meta-sep">·</span>
                  <span className="mcp-detail-meta-error">{target.error}</span>
                </>
              )}
            </div>
          </div>

          {/* Search */}
          {tools.length > 5 && (
            <div className="mcp-detail-search-wrap">
              <Search size={14} className="mcp-detail-search-icon" />
              <input
                className="mcp-detail-search"
                placeholder={`Filter ${tools.length} tools…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}

          {/* Tool table */}
          {filtered.length === 0 ? (
            <div className="mcp-detail-empty">
              <p>No tools{search ? " match your search" : " loaded"}</p>
            </div>
          ) : (
            <div className="mcp-detail-table-wrap">
              <table className="mcp-detail-table">
                <thead>
                  <tr>
                    <th className="mcp-detail-th-tool">Tool</th>
                    <th className="mcp-detail-th-desc">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                      <tr key={t.name} className="mcp-detail-tr">
                        <td className="mcp-detail-td-tool">
                          <code className="mcp-detail-tool-name">{t.name}</code>
                        </td>
                        <td className="mcp-detail-td-desc">
                          {t.description || <span className="muted">—</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
