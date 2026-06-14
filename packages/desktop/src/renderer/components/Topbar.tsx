import {
  FolderTree,
  PanelLeft,
  RefreshCw,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { RuntimeStatus } from "../types.js";
import type { SettingsMetadata } from "../../shared/ipc.js";
import { ModelSelector } from "./ModelSelector.js";

interface TopbarProps {
  runtimeStatus: RuntimeStatus;
  settings: SettingsMetadata | null;
  totalTokens: number;
  workspaceName: string;
  settingsOpen: boolean;
  onToggleSidebar: () => void;
  onModelChange: (model: string) => void;
  onToggleSettings: () => void;
  onRestart: () => void;
}

function runtimeCopy(status: RuntimeStatus) {
  switch (status) {
    case "ready":
      return "Runtime ready";
    case "starting":
      return "Connecting runtime";
    case "disconnected":
      return "Runtime disconnected";
  }
}

export function Topbar({
  runtimeStatus,
  settings,
  totalTokens,
  workspaceName,
  settingsOpen,
  onToggleSidebar,
  onModelChange,
  onToggleSettings,
  onRestart,
}: TopbarProps) {
  const selectedModel = settings?.defaultModel ?? "coder";
  const availableModels =
    settings?.availableModels.length ? settings.availableModels : [selectedModel];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          type="button"
        >
          <PanelLeft size={17} />
        </button>

        <div className="topbar-status-block">
          <div className="topbar-title-row">
            <FolderTree size={15} />
            <strong>{workspaceName}</strong>
          </div>
          <div className="topbar-status-row">
            <span className={`status-dot ${runtimeStatus}`} />
            <span>{runtimeCopy(runtimeStatus)}</span>
          </div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="token-pill" title="Total tokens in the active session">
          <Sparkles size={14} />
          <code>{totalTokens.toLocaleString()} tokens</code>
        </div>

        <ModelSelector
          models={availableModels}
          selectedModel={selectedModel}
          disabled={runtimeStatus !== "ready"}
          onSelect={onModelChange}
        />

        <button
          className={settingsOpen ? "secondary-button active" : "secondary-button"}
          onClick={onToggleSettings}
          type="button"
          title="Toggle settings panel"
        >
          <Settings2 size={14} />
          Settings
        </button>

        {runtimeStatus === "disconnected" && (
          <button className="secondary-button" onClick={onRestart} type="button">
            <RefreshCw size={14} />
            Restart
          </button>
        )}
      </div>
    </header>
  );
}
