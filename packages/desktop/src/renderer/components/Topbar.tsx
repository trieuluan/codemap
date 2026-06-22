import {
  Brain,
  Cloud,
  Hammer,
  Link2,
  Map,
  MessagesSquare,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Server,
  Settings,
  User,
  Waypoints,
  Zap,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import type { RuntimeStatus } from "../types.js";
import type { RecentWorkspace } from "./Launcher.js";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu.js";

interface TopbarProps {
  runtimeStatus: RuntimeStatus;
  workspace: string;
  recents: RecentWorkspace[];
  inspectorOpen: boolean;
  mode: "build" | "plan" | "fast";
  onModeChange: (mode: "build" | "plan" | "fast") => void;
  onToggleSidebar: () => void;
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
  onModeChange,
  onToggleSidebar,
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
  const activeAccountSection = (() => {
    const p = location.pathname;
    if (p === "/account" || p === "/account/identity") return "identity";
    if (p === "/account/all-projects") return "projects";
    if (p === "/account/projects") return "linked";
    if (p.startsWith("/account/mcp")) return "mcp";
    if (p === "/account/memory") return "memory";
    if (p === "/account/settings") return "settings";
    return "";
  })();

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2.5 py-[7px] text-[11px] text-[var(--muted)] hover:bg-[var(--hover)]"
                  title={`Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)} — click to switch`}
                  type="button"
                >
                  {mode === "build" && <Hammer size={12} />}
                  {mode === "plan" && <Map size={12} />}
                  {mode === "fast" && <Zap size={12} />}
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4}>
                <DropdownMenuRadioGroup
                  value={mode}
                  onValueChange={(v) => onModeChange(v as "build" | "plan" | "fast")}
                >
                  <DropdownMenuRadioItem value="build">
                    <Hammer size={13} className="mr-1.5 opacity-70" />
                    Build
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="plan">
                    <Map size={13} className="mr-1.5 opacity-70" />
                    Plan
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="fast">
                    <Zap size={13} className="mr-1.5 opacity-70" />
                    Fast
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={isAccount ? "icon-button active" : "icon-button"}
              type="button"
              title="Account"
            >
              <User size={17} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuRadioGroup value={activeAccountSection}>
              <DropdownMenuRadioItem className="pl-2" value="identity" onSelect={() => navigate("/account/identity")}>
                <span className="flex items-center gap-2"><User size={14} />Identity</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem className="pl-2" value="projects" onSelect={() => navigate("/account/all-projects")}>
                <span className="flex items-center gap-2"><Cloud size={14} />Projects</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem className="pl-2" value="linked" onSelect={() => navigate("/account/projects")}>
                <span className="flex items-center gap-2"><Link2 size={14} />Linked Project</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem className="pl-2" value="mcp" onSelect={() => navigate("/account/mcp")}>
                <span className="flex items-center gap-2"><Server size={14} />MCP Servers</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem className="pl-2" value="memory" onSelect={() => navigate("/account/memory")}>
                <span className="flex items-center gap-2"><Brain size={14} />Memory</span>
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem className="pl-2" value="settings" onSelect={() => navigate("/account/settings")}>
                <span className="flex items-center gap-2"><Settings size={14} />Settings</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

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
