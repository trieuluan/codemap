import { useEffect, useState, type RefObject } from "react";
import { Brain, ChevronDown, Cloud, GitBranch, Layers, Link2, PanelLeft, RotateCcw, Search, Server, Settings, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { RuntimeStatus } from "../types.js";
import type { IndexStatus } from "../../shared/ipc.js";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "./ui/dropdown-menu.js";

interface TopbarProps {
  runtimeStatus: RuntimeStatus;
  workspace: string;
  mode: "build" | "plan" | "fast";
  index: IndexStatus | null;
  searchQuery: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onSearchChange: (query: string) => void;
  onModeChange: (mode: "build" | "plan" | "fast") => void;
  onToggleSidebar: () => void;
  onRestart: () => void;
}
const sections = [
  { path: "/account/identity", label: "Identity", icon: User },
  { path: "/account/all-projects", label: "Projects", icon: Cloud },
  { path: "/account/projects", label: "Linked project", icon: Link2 },
  { path: "/account/mcp", label: "MCP servers", icon: Server },
  { path: "/account/memory", label: "Memory", icon: Brain },
  { path: "/account/settings", label: "Settings", icon: Settings },
];

export function Topbar({ runtimeStatus, workspace, mode, index, searchQuery, searchRef, onSearchChange, onModeChange, onToggleSidebar, onRestart }: TopbarProps) {
  const navigate = useNavigate();
  const [branch, setBranch] = useState("");
  useEffect(() => { void window.codemap.getBranchName().then(setBranch).catch(() => {}); }, [workspace]);
  const status = index?.status === "indexing" ? "Indexing" : index?.status === "error" ? "Index error" : runtimeStatus === "ready" ? index?.status === "ready" ? "Indexed" : "Ready" : runtimeStatus === "starting" ? "Starting" : "Disconnected";
  return <header className="focus-topbar">
    <a className="focus-brand" href="#/map" aria-label="CodeMap graph"><Layers size={20} /><strong>codemap</strong></a>
    <button className="focus-icon focus-explorer-toggle" onClick={onToggleSidebar} title="Toggle file explorer" aria-label="Toggle file explorer"><PanelLeft size={16} /></button>
    <div className="focus-workspace-name" title={workspace}><span>{workspace.split(/[\\/]/).filter(Boolean).at(-1)}</span><small>LOCAL</small></div>
    <label className="focus-search"><Search size={14} /><input ref={searchRef} value={searchQuery} onChange={event => onSearchChange(event.target.value)} placeholder="Search files and graph…" aria-label="Search files and graph" /><kbd>{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"} K</kbd></label>
    <div className="focus-toolbar">
      {branch && <span className="focus-branch" title={`Branch: ${branch}`}><GitBranch size={13} />{branch}</span>}
      <span className={`focus-index ${runtimeStatus === "ready" && index?.status !== "error" ? "ready" : ""}`} title={`Runtime: ${runtimeStatus}. ${status}`}><i />{status}</span>
      <label className="focus-mode"><Brain size={13} /><select aria-label="Agent mode" value={mode} onChange={event => onModeChange(event.target.value as "build" | "plan" | "fast")}><option value="build">Build</option><option value="plan">Plan</option><option value="fast">Fast</option></select><ChevronDown size={10} /></label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button className="focus-avatar" title="Account and settings" aria-label="Account and settings"><User size={15} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">{sections.map(({ path, label, icon: ItemIcon }) => <DropdownMenuItem key={path} onSelect={() => navigate(path)}><ItemIcon size={14} />{label}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem onSelect={onRestart}><RotateCcw size={14} />Restart runtime</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>;
}
