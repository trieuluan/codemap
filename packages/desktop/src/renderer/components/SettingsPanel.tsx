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
    <section className="grid gap-3 overflow-hidden rounded-[12px] border border-[var(--border)] bg-[linear-gradient(180deg,#141416,#101012)] p-[14px]">
      <div className="flex items-center gap-2">
        {icon}
        <strong>{title}</strong>
      </div>
      {children}
    </section>
  );
}

function SettingList({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-3 [&_div]:grid [&_div]:gap-1 [&_dd]:m-0 [&_dd]:text-[13px] [&_dd]:text-[#ededee] [&_dd_code]:text-[11px] [&_dt]:text-[11px] [&_dt]:uppercase [&_dt]:text-[var(--muted)]">{children}</dl>;
}

export function SettingsContent({ settings }: SettingsContentProps) {
  return (
    <div className="grid gap-3 overflow-auto p-[14px]">
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
        <div className="flex flex-col items-stretch gap-2">
          <div
            className={`flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--card-soft)] px-3 py-2.5 text-[12px] ${settings?.hasApiKey ? "text-[#b5ddc0]" : "text-[#ddb7b7]"}`}
          >
            <CheckCircle2 size={14} />
            Gateway API key {settings?.hasApiKey ? "configured" : "missing"}
          </div>
          <div
            className={`flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--card-soft)] px-3 py-2.5 text-[12px] ${settings?.hasApiToken ? "text-[#b5ddc0]" : "text-[#ddb7b7]"}`}
          >
            <CheckCircle2 size={14} />
            CodeMap API token {settings?.hasApiToken ? "configured" : "missing"}
          </div>
        </div>
        <p className="muted text-[12px]">
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
