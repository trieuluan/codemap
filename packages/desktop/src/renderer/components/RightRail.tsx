import { Gauge, GitBranch, ListChecks, PanelRightClose, PanelRightOpen, Settings2 } from "lucide-react";
import type { SessionSnapshot } from "@codemap-ai/core/agent/contracts";
import type { SettingsMetadata } from "../../shared/ipc.js";
import { PlanTimelinePanel } from "./PlanTimelinePanel.js";
import { SettingsContent } from "./SettingsPanel.js";
import { TokenObservabilityPanel } from "./TokenObservabilityPanel.js";
import { WorkingDiffPanel } from "./WorkingDiffPanel.js";

export type InspectorTab = "plan" | "context" | "diff" | "settings";

function modelContextLimit(modelId: string): number {
  if (/gpt-4|o1|o3/i.test(modelId)) return 128_000;
  if (/claude/i.test(modelId)) return 200_000;
  if (/gemini/i.test(modelId)) return 1_000_000;
  if (/deepseek/i.test(modelId)) return 128_000;
  return 200_000;
}

interface RightRailProps {
  mode: "plan" | "build";
  onTabChange: (tab: InspectorTab) => void;
  onStartResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  onToggle: () => void;
  open: boolean;
  settings: SettingsMetadata | null;
  snapshot: SessionSnapshot;
  tab: InspectorTab;
  selectedModel: string;
  width: number;
}

const tabs = [
  { id: "plan" as const, label: "Plan", icon: ListChecks },
  { id: "context" as const, label: "Context", icon: Gauge },
  { id: "diff" as const, label: "Diff", icon: GitBranch },
  { id: "settings" as const, label: "Settings", icon: Settings2 },
];

export function RightRail({
  mode,
  onStartResize,
  onTabChange,
  onToggle,
  open,
  settings,
  snapshot,
  tab,
  selectedModel,
  width,
}: RightRailProps) {
  if (!open) {
    return (
      <aside className="inspector-rail collapsed" aria-label="Inspector">
        <button className="inspector-strip-tab" onClick={onToggle} title="Open inspector" type="button">
          <PanelRightOpen size={17} />
        </button>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={`inspector-strip-tab inspector-collapsed-tab${tab === id ? " active" : ""}`}
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
    <>
      <div
        className="inspector-resize-handle"
        onPointerDown={onStartResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
      />
      <aside className="inspector-rail" aria-label="Inspector" style={{ width }}>
        <header className="inspector-head">
          <div className="inspector-tabs">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button className={`inspector-tab${tab === id ? " active" : ""}`} key={id} onClick={() => onTabChange(id)} type="button">
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
          <button className="icon-button" onClick={onToggle} title="Collapse inspector" type="button">
            <PanelRightClose size={17} />
          </button>
        </header>
        <div className="inspector-body">
          {tab === "plan" && <PlanTimelinePanel mode={mode} snapshot={snapshot} />}
          {tab === "context" && <TokenObservabilityPanel snapshot={snapshot} contextLimit={modelContextLimit(snapshot.model ?? selectedModel)} />}
          {tab === "diff" && <WorkingDiffPanel />}
          {tab === "settings" && (
            <div className="inspector-settings">
              <SettingsContent settings={settings} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
