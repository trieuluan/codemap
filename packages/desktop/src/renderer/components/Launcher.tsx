import {
  CircleUserRound,
  Folder,
  FolderDown,
  FolderOpen,
  History,
  LoaderCircle,
  TerminalSquare,
} from "lucide-react";

export interface RecentWorkspace {
  path: string;
  name: string;
  openedAt: number;
}

interface LauncherProps {
  error: string | null;
  openingWorkspace: string | null;
  recents: RecentWorkspace[];
  onOpenWorkspace: () => void;
  onResumeWorkspace: (path: string) => void;
}

function relativeOpenedAt(openedAt: number) {
  const minutes = Math.max(1, Math.round((Date.now() - openedAt) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function Launcher({
  error,
  openingWorkspace,
  recents,
  onOpenWorkspace,
  onResumeWorkspace,
}: LauncherProps) {
  const lastWorkspace = recents[0];
  const isOpening = openingWorkspace !== null;
  const openingName = openingWorkspace
    ?.split("/")
    .filter(Boolean)
    .at(-1);

  if (!lastWorkspace) {
    return (
      <main className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_26%,#161618_0,transparent_40%),var(--background)] p-8">
        <div className="w-[min(420px,100%)] rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,#121214,#0f0f10)] p-[34px] shadow-[0_18px_70px_rgb(0_0_0/35%)]">
          <div className="mb-7 grid h-[42px] w-[42px] place-items-center rounded-[10px] border border-[var(--border-strong)] bg-[var(--card)]">
            <TerminalSquare size={21} />
          </div>
          <p className="eyebrow">CodeMap desktop</p>
          <h1>Open a workspace</h1>
          <p className="muted">
            Start a session with your CLI account, models and MCP servers.
          </p>
          <div className="flex items-center gap-3">
            <button
              className="primary-button mt-[22px]"
              disabled={isOpening}
              onClick={onOpenWorkspace}
              type="button"
            >
              {isOpening ? <LoaderCircle className="spin" size={16} /> : <FolderOpen size={16} />}
              {isOpening ? "Starting workspace..." : "Choose folder"}
            </button>
          </div>
          {error ? <div className="mt-3 rounded-[var(--radius)] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] px-4 py-3 text-[13px] text-[#f87171]">{error}</div> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="grid h-full grid-cols-[minmax(320px,0.85fr)_minmax(420px,1.15fr)] bg-[var(--background)]">
      <section className="flex min-w-0 flex-col gap-[18px] border-r border-[var(--border)] bg-[linear-gradient(180deg,#101012,#0d0d0e)] p-9">
        <div className="flex items-center gap-3 [&_h1]:mb-0 [&_h1]:mt-1 [&_h1]:text-[21px]">
          <div className="grid h-[42px] w-[42px] place-items-center rounded-[10px] border border-[var(--border-strong)] bg-[var(--card)]">
            <TerminalSquare size={20} />
          </div>
          <div>
            <p className="eyebrow">CodeMap desktop</p>
            <h1>Welcome back</h1>
          </div>
        </div>
        <p className="muted">
          Pick up where you left off, or open a new folder to start a session
          with your CLI account, models and MCP servers.
        </p>
        <button
          className="primary-button mt-2 justify-start"
          disabled={isOpening}
          onClick={() => onResumeWorkspace(lastWorkspace.path)}
          type="button"
        >
          {openingWorkspace === lastWorkspace.path ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <History size={16} />
          )}
          {openingWorkspace === lastWorkspace.path
            ? `Starting ${lastWorkspace.name}...`
            : `Resume ${lastWorkspace.name}`}
          <span className="ml-auto font-mono text-[10px] text-[#6a6a55]">
            {openingWorkspace === lastWorkspace.path
              ? "Loading runtime"
              : relativeOpenedAt(lastWorkspace.openedAt)}
          </span>
        </button>
        <div className="flex items-center gap-3">
          <button
            className="secondary-button"
            disabled={isOpening}
            onClick={onOpenWorkspace}
            type="button"
          >
            {openingWorkspace === "Choose folder" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <FolderOpen size={15} />
            )}
            {openingWorkspace === "Choose folder" ? "Opening..." : "Open folder"}
          </button>
        </div>
        {isOpening ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-3 text-xs leading-6 text-[var(--muted)]" role="status">
            <LoaderCircle className="spin" size={15} />
            <span>
              Initializing {openingName === "Choose folder" ? "workspace" : openingName}.
              Loading models, MCP servers, and project context.
            </span>
          </div>
        ) : null}
        {error ? <div className="mt-3 rounded-[var(--radius)] border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)] px-4 py-3 text-[13px] text-[#f87171]">{error}</div> : null}
        <div className="mt-auto flex min-h-[120px] items-center justify-center gap-2.5 rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[rgb(255_255_255/2%)] text-[13px] text-[var(--muted)]">
          <FolderDown size={20} />
          <span>Drag a project folder here</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--muted)] [&_span]:inline-flex [&_span]:items-center [&_span]:gap-1.5">
          <span>
            <CircleUserRound size={13} />
            local runtime
          </span>
          <span>desktop</span>
        </div>
      </section>

      <section className="min-w-0 overflow-auto p-9">
        <p className="eyebrow">Recent workspaces</p>
        <div className="mt-3.5 grid gap-2">
          {recents.map((workspace) => (
            <button
              className={`grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border border-transparent bg-transparent px-3 py-[11px] text-left text-inherit transition-colors hover:border-[var(--border)] hover:bg-[var(--hover)] ${openingWorkspace === workspace.path ? "opacity-80" : ""}`}
              disabled={isOpening}
              key={workspace.path}
              onClick={() => onResumeWorkspace(workspace.path)}
              type="button"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--text-dim)]">
                {openingWorkspace === workspace.path ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Folder size={15} />
                )}
              </span>
              <span className="grid min-w-0">
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">{workspace.name}</span>
                <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[var(--muted)]">{workspace.path}</span>
              </span>
              <span className="text-right text-[10px] text-[var(--muted)] [&_code]:block [&_code]:overflow-hidden [&_code]:text-ellipsis [&_code]:whitespace-nowrap [&_span]:block [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap">
                <code>{openingWorkspace === workspace.path ? "starting" : "coder"}</code>
                <span>
                  {openingWorkspace === workspace.path
                    ? "Loading runtime"
                    : relativeOpenedAt(workspace.openedAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
