import type { ReactNode } from "react";
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

interface SettingsContentProps {
  settings: SettingsMetadata | null;
}

function settingValue(value: string | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

function SettingsCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card">
      <div className="settings-card-header">
        {icon}
        <strong>{title}</strong>
      </div>
      {children}
    </section>
  );
}

function SettingList({ children }: { children: React.ReactNode }) {
  return <dl>{children}</dl>;
}

export function SettingsContent({ settings }: SettingsContentProps) {
  return (
    <div className="settings-panel-body">
      <SettingsCard icon={<Server size={15} />} title="Gateway">
        <SettingList>
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
        </SettingList>
      </SettingsCard>

      <SettingsCard icon={<Sparkles size={15} />} title="Model defaults">
        <SettingList>
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
        </SettingList>
      </SettingsCard>

      <SettingsCard icon={<KeyRound size={15} />} title="Credentials">
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
      </SettingsCard>
    </div>
  );
}

export function SettingsPanel({ settings, open, onToggle }: SettingsPanelProps) {
  return (
    <aside
      className={open
        ? "grid min-w-0 grid-rows-[auto_minmax(0,1fr)] border-l border-[var(--border)] bg-[linear-gradient(180deg,#101012_0%,#0f0f11_100%)]"
        : "grid min-w-0 grid-rows-[auto_1fr] border-l border-[var(--border)] bg-[linear-gradient(180deg,#101012_0%,#0f0f11_100%)]"}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
        <div>
          <p className="eyebrow">Runtime settings</p>
          <h2 className="mt-1 text-[17px]">Session configuration</h2>
        </div>
        <button className="icon-button" type="button" onClick={onToggle} title={open ? "Hide settings" : "Show settings"}>
          {open ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
      </div>

      {open ? <SettingsContent settings={settings} /> : null}
    </aside>
  );
}
