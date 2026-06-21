import {
  Hammer,
  Map,
  MessagesSquare,
  PanelLeft,
  PanelRight,
  RefreshCw,
  User,
  Waypoints,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import type { RuntimeStatus } from "../types.js";
import type { RecentWorkspace } from "./Launcher.js";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.js";

interface TopbarProps {
  runtimeStatus: RuntimeStatus;
  workspace: string;
  recents: RecentWorkspace[];
  inspectorOpen: boolean;
  mode: "plan" | "build";
  onToggleSidebar: () => void;
  onModeChange: (mode: "plan" | "build") => void;
  onToggleInspector: () => void;
  onRestart: () => void;
  onSwitchWorkspace: (path: string) => void;
  onOpenWorkspace: () => void;
  onOpenLauncher: () => void;
}

export function Topbar({
  runtimeStatus,
  workspace,
  recents,
  inspectorOpen,
  mode,
  onToggleSidebar,
  onModeChange,
  onToggleInspector,
  onRestart,
  onSwitchWorkspace,
  onOpenWorkspace,
  onOpenLauncher,
}: TopbarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isChat = location.pathname === "/chat" || location.pathname === "/";
  const isMap = location.pathname === "/map";
  const isAccount = location.pathname.startsWith("/account");

  const segmentedControlClass =
    "inline-flex items-center gap-0.5 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[3px]";
  const segmentedButtonClass = (active: boolean) =>
    `inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] border-0 px-2.5 py-[7px] text-[12px] ${active ? "bg-[var(--hover)] text-[var(--foreground)]" : "bg-transparent text-[var(--muted)] hover:text-[var(--text-dim)]"}`;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[rgb(11_11_12_/_88%)] px-[18px] py-3 backdrop-blur-[18px]">
      <div className="flex items-center gap-3">
        {!isAccount && (
          <button
            className="icon-button"
            onClick={onToggleSidebar}
            title="Toggle sidebar"
            type="button"
          >
            <PanelLeft size={17} />
          </button>
        )}

        <WorkspaceSwitcher
          workspace={workspace}
          runtimeStatus={runtimeStatus}
          recents={recents}
          onSwitchWorkspace={onSwitchWorkspace}
          onOpenWorkspace={onOpenWorkspace}
          onOpenLauncher={onOpenLauncher}
        />
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        {!isAccount && (
          <>
            <div className={segmentedControlClass} aria-label="Workspace view">
              <button
                className={segmentedButtonClass(isChat)}
                onClick={() => navigate("/chat")}
                type="button"
              >
                <MessagesSquare size={13} />
                Chat
              </button>
              <button
                className={segmentedButtonClass(isMap)}
                onClick={() => navigate("/map")}
                type="button"
              >
                <Waypoints size={13} />
                Map
              </button>
            </div>
            <div
              className={segmentedControlClass}
              title="Plan = read-only · Build = full tool access"
            >
              <button
                className={segmentedButtonClass(mode === "plan")}
                onClick={() => onModeChange("plan")}
                type="button"
              >
                <Map size={13} />
                Plan
              </button>
              <button
                className={segmentedButtonClass(mode === "build")}
                onClick={() => onModeChange("build")}
                type="button"
              >
                <Hammer size={13} />
                Build
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          className={isAccount ? "icon-button active" : "icon-button"}
          onClick={() => navigate(isAccount ? "/chat" : "/account/identity")}
          type="button"
          title="Account"
        >
          <User size={17} />
        </button>

        {!isAccount && (
          <button
            className={inspectorOpen ? "icon-button active" : "icon-button"}
            onClick={onToggleInspector}
            type="button"
            title="Toggle inspector"
          >
            <PanelRight size={17} />
          </button>
        )}

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
