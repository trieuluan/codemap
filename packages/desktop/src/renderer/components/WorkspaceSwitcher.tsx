import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen, FolderTree, LayoutGrid } from "lucide-react";
import type { RuntimeStatus } from "../types.js";
import type { RecentWorkspace } from "./Launcher.js";

interface WorkspaceSwitcherProps {
  workspace: string;
  runtimeStatus: RuntimeStatus;
  recents: RecentWorkspace[];
  onSwitchWorkspace: (path: string) => void;
  onOpenWorkspace: () => void;
  onOpenLauncher: () => void;
}

function runtimeCopy(status: RuntimeStatus) {
  if (status === "ready") return "Runtime ready";
  if (status === "starting") return "Connecting runtime";
  return "Runtime disconnected";
}

function runtimeDotClass(status: RuntimeStatus) {
  if (status === "ready") return "bg-[var(--success)]";
  if (status === "starting") return "bg-[var(--warning)]";
  return "bg-[var(--danger)]";
}

export function WorkspaceSwitcher({
  workspace,
  runtimeStatus,
  recents,
  onSwitchWorkspace,
  onOpenWorkspace,
  onOpenLauncher,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const workspaceName = workspace.split("/").filter(Boolean).at(-1) ?? workspace;
  const otherWorkspaces = recents.filter((recent) => recent.path !== workspace);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-2.5 py-1.5 text-inherit ${open ? "border-[var(--border)] bg-[var(--card)]" : "border-transparent bg-transparent hover:border-[var(--border)] hover:bg-[var(--card)]"}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <FolderTree size={15} />
        <span className="grid gap-0.5 text-left">
          <strong className="text-[14px]">{workspaceName}</strong>
          <small className="flex items-center gap-[7px] text-[11px] text-[var(--muted)]">
            <i className={`h-[7px] w-[7px] rounded-full ${runtimeDotClass(runtimeStatus)}`} />
            {runtimeCopy(runtimeStatus)}
          </small>
        </span>
        <ChevronDown size={14} className={`transition-transform duration-100 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 min-w-[260px] overflow-hidden rounded-[12px] border border-[var(--border-strong)] bg-[#121214] shadow-[0_14px_40px_rgb(0_0_0/40%)]" role="dialog">
          {otherWorkspaces.length > 0 && (
            <>
              <p className="eyebrow px-3 pt-3">Switch workspace</p>
              {otherWorkspaces.map((recent) => (
                <button
                  className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-2.5 text-left text-[#ededee] hover:bg-[var(--hover)]"
                  key={recent.path}
                  onClick={() => {
                    onSwitchWorkspace(recent.path);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <FolderOpen size={15} />
                  <span className="min-w-0">
                    <strong className="text-[13px]">{recent.name}</strong>
                    <code className="block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[var(--muted)]">
                      {recent.path}
                    </code>
                  </span>
                </button>
              ))}
            </>
          )}
          <div className="grid gap-1.5 border-t border-[var(--border)] p-1.5">
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] border-0 bg-transparent px-2.5 py-2 text-left text-[#ededee] hover:bg-[var(--hover)]"
              onClick={() => {
                onOpenWorkspace();
                setOpen(false);
              }}
              type="button"
            >
              <FolderOpen size={15} />
              Open another folder
            </button>
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] border-0 bg-transparent px-2.5 py-2 text-left text-[#ededee] hover:bg-[var(--hover)]"
              onClick={() => {
                onOpenLauncher();
                setOpen(false);
              }}
              type="button"
            >
              <LayoutGrid size={15} />
              Open launcher
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
