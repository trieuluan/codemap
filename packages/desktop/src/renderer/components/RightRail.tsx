import { Gauge, ListChecks, PanelRightClose, PanelRightOpen, Settings2 } from "lucide-react";
import type { SessionSnapshot } from "@codemap-ai/core/agent/contracts";
import type { SettingsMetadata } from "../../shared/ipc.js";
import { PlanTimelinePanel } from "./PlanTimelinePanel.js";
import { SettingsContent } from "./SettingsPanel.js";
import { TokenObservabilityPanel } from "./TokenObservabilityPanel.js";

export type InspectorTab = "plan" | "context" | "settings";

interface RightRailProps {
  mode: "plan" | "build";
  onTabChange: (tab: InspectorTab) => void;
  onToggle: () => void;
  open: boolean;
  settings: SettingsMetadata | null;
  snapshot: SessionSnapshot;
  tab: InspectorTab;
}

const tabs = [
  { id: "plan" as const, label: "Plan", icon: ListChecks },
  { id: "context" as const, label: "Context", icon: Gauge },
  { id: "settings" as const, label: "Settings", icon: Settings2 },
];

export function RightRail({ mode, onTabChange, onToggle, open, settings, snapshot, tab }: RightRailProps) {
  if (!open) {
    return (
      <aside className="flex flex-col min-w-0 w-14 border-l border-border bg-background items-center pt-2" aria-label="Inspector">
        <button className="flex items-center justify-center w-[34px] h-[34px] rounded-lg text-muted-foreground bg-transparent border-none cursor-pointer hover:bg-muted hover:text-secondary-foreground" onClick={onToggle} title="Open inspector" type="button">
          <PanelRightOpen size={17} />
        </button>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={`flex items-center justify-center w-[34px] h-[34px] rounded-lg mt-1 cursor-pointer text-muted-foreground bg-transparent border-none hover:bg-muted hover:text-secondary-foreground inspector-collapsed-tab${tab === id ? " active" : ""}`}
            key={id}
            onClick={() => {
              onTabChange(id);
              onToggle();
            }}
            title={label}
            type="button"
          >
            <Icon size={17} />
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="flex flex-col min-w-0 w-[360px] border-l border-border bg-background" aria-label="Inspector">
      <header className="flex gap-0 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button className={`flex-1 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground bg-transparent border-none border-b-2 border-transparent cursor-pointer transition-all hover:bg-muted hover:text-secondary-foreground inspector-tab${tab === id ? " active" : ""}`} key={id} onClick={() => onTabChange(id)} type="button">
            <Icon size={15} />{label}
          </button>
        ))}
        <button className="flex items-center justify-center w-[34px] h-[34px] rounded-lg bg-transparent text-muted-foreground border-none cursor-pointer hover:bg-muted hover:text-secondary-foreground" onClick={onToggle} title="Collapse inspector" type="button">
          <PanelRightClose size={17} />
        </button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "plan" && <PlanTimelinePanel mode={mode} snapshot={snapshot} />}
        {tab === "context" && <TokenObservabilityPanel snapshot={snapshot} />}
        {tab === "settings" && <SettingsContent settings={settings} />}
      </div>
    </aside>
  );
}
