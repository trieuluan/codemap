import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Server,
  Sparkles,
  KeyRound,
  CheckCircle2,
  Database,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { SettingsMetadata } from "../../shared/ipc.js";

function settingValue(value: string | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [indexingActive, setIndexingActive] = useState(false);
  const [indexingLoading, setIndexingLoading] = useState(true);
  const [indexingToggling, setIndexingToggling] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.codemap
      .readSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.codemap
      .getAutoIndexStatus()
      .then((status) => {
        if (!cancelled && status) setIndexingActive(status.isActive);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIndexingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleIndexing = useCallback(async () => {
    setIndexingToggling(true);
    setIndexingStatus(null);
    try {
      if (indexingActive) {
        const result = await window.codemap.disableAutoIndexing();
        if (result?.success !== false) {
          setIndexingActive(false);
          setIndexingStatus({ text: "Auto-indexing disabled", ok: true });
        } else {
          setIndexingStatus({ text: result?.error ?? "Failed to disable auto-indexing", ok: false });
        }
      } else {
        const result = await window.codemap.enableAutoIndexing();
        if (result?.success !== false) {
          setIndexingActive(true);
          setIndexingStatus({ text: "Auto-indexing enabled", ok: true });
        } else {
          setIndexingStatus({ text: result?.error ?? "Failed to enable auto-indexing", ok: false });
        }
      }
    } catch (e) {
      setIndexingStatus({ text: (e as Error)?.message ?? "Toggle failed", ok: false });
    } finally {
      setIndexingToggling(false);
      setTimeout(() => setIndexingStatus(null), 3000);
    }
  }, [indexingActive]);

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <button
          className="settings-back-btn"
          onClick={() => navigate("/chat")}
          type="button"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <h1 className="settings-page-title">Settings</h1>
      </header>

      {loading ? (
        <div className="settings-page-loading">Loading settings…</div>
      ) : (
        <div className="settings-page-body">
          {/* Gateway */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Server size={16} />
              <strong>Gateway</strong>
            </div>
            <dl className="settings-card-list">
              <div className="settings-card-row">
                <dt>Provider</dt>
                <dd>{settingValue(settings?.provider, "9router")}</dd>
              </div>
              <div className="settings-card-row">
                <dt>Base URL</dt>
                <dd>
                  <code>{settingValue(settings?.baseUrl, "http://localhost:4000/v1")}</code>
                </dd>
              </div>
            </dl>
          </section>

          {/* Model defaults */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Sparkles size={16} />
              <strong>Model defaults</strong>
            </div>
            <dl className="settings-card-list">
              <div className="settings-card-row">
                <dt>Selected model</dt>
                <dd>
                  <code>{settingValue(settings?.defaultModel, "coder")}</code>
                </dd>
              </div>
              <div className="settings-card-row">
                <dt>Available models</dt>
                <dd>{settings?.availableModels.length ?? 0}</dd>
              </div>
            </dl>
          </section>

          {/* Indexing */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Database size={16} />
              <strong>Indexing</strong>
            </div>
            <div className="settings-toggle-row">
              <div className="settings-toggle-info">
                <span className="settings-toggle-label">Auto-index files</span>
                <span className="settings-toggle-desc">
                  Watch workspace files and update the index automatically when they change.
                </span>
              </div>
              <button
                className="settings-toggle"
                onClick={() => void toggleIndexing()}
                disabled={indexingLoading || indexingToggling}
                type="button"
                aria-pressed={indexingActive}
              >
                {indexingLoading || indexingToggling ? (
                  <Loader2 size={14} className="spin" />
                ) : indexingActive ? (
                  <span className="toggle-dot toggle-dot--on" />
                ) : (
                  <span className="toggle-dot toggle-dot--off" />
                )}
              </button>
            </div>
            {indexingStatus && (
              <p className={`settings-status ${indexingStatus.ok ? "settings-status--ok" : "settings-status--err"}`}>
                {indexingStatus.text}
              </p>
            )}
          </section>

          {/* Credentials */}
          <section className="settings-card">
            <div className="settings-card-header">
              <KeyRound size={16} />
              <strong>Credentials</strong>
            </div>
            <div className="settings-credential-list">
              <div
                className={`credential-state ${settings?.hasApiKey ? "ok" : "missing"}`}
              >
                <CheckCircle2 size={14} />
                Gateway API key {settings?.hasApiKey ? "configured" : "missing"}
              </div>
              <div
                className={`credential-state ${settings?.hasApiToken ? "ok" : "missing"}`}
              >
                <CheckCircle2 size={14} />
                CodeMap API token {settings?.hasApiToken ? "configured" : "missing"}
              </div>
            </div>
            <p className="muted settings-note">
              Secrets stay in your local config. This panel only shows whether they are present.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
