import {
  CheckCircle2,
  KeyRound,
  PanelRightClose,
  PanelRightOpen,
  Server,
  Sparkles,
} from "lucide-react";
import type { SettingsMetadata } from "../../shared/ipc.js";

interface SettingsPanelProps {
  settings: SettingsMetadata | null;
  open: boolean;
  onToggle: () => void;
}

function settingValue(value: string | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

export function SettingsPanel({ settings, open, onToggle }: SettingsPanelProps) {
  return (
    <aside className={open ? "settings-panel" : "settings-panel collapsed"}>
      <div className="settings-panel-header">
        <div>
          <p className="eyebrow">Runtime settings</p>
          <h2>Session configuration</h2>
        </div>
        <button className="icon-button" type="button" onClick={onToggle} title={open ? "Hide settings" : "Show settings"}>
          {open ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>

      {open ? (
        <div className="settings-panel-body">
          <section className="settings-card">
            <div className="settings-card-header">
              <Server size={15} />
              <strong>Gateway</strong>
            </div>
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>{settingValue(settings?.provider, "9router")}</dd>
              </div>
              <div>
                <dt>Base URL</dt>
                <dd>
                  <code>{settingValue(settings?.baseUrl, "http://localhost:4000/v1")}</code>
                </dd>
              </div>
            </dl>
          </section>

          <section className="settings-card">
            <div className="settings-card-header">
              <Sparkles size={15} />
              <strong>Model defaults</strong>
            </div>
            <dl>
              <div>
                <dt>Selected model</dt>
                <dd>
                  <code>{settingValue(settings?.defaultModel, "coder")}</code>
                </dd>
              </div>
              <div>
                <dt>Available models</dt>
                <dd>{settings?.availableModels.length ?? 0}</dd>
              </div>
            </dl>
          </section>

          <section className="settings-card">
            <div className="settings-card-header">
              <KeyRound size={15} />
              <strong>Credentials</strong>
            </div>
            <div className="settings-credential-list">
              <div className={settings?.hasApiKey ? "credential-state ok" : "credential-state missing"}>
                <CheckCircle2 size={14} />
                Gateway API key {settings?.hasApiKey ? "configured" : "missing"}
              </div>
              <div className={settings?.hasApiToken ? "credential-state ok" : "credential-state missing"}>
                <CheckCircle2 size={14} />
                CodeMap API token {settings?.hasApiToken ? "configured" : "missing"}
              </div>
            </div>
            <p className="muted settings-note">
              Secrets stay in your local config. This panel only shows whether they are present.
            </p>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
