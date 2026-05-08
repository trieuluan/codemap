"use client";

import {
  Bell, CheckCircle2, Clock, Loader2,
  Moon, Search, Sun, XCircle, ChevronsUpDown,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MobileMenuButton } from "@/components/app-sidebar";
import { authClient } from "@/lib/auth-client";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { useToast } from "@/components/ui/use-toast";
import { browserProjectsApi, type ProjectListItem } from "@/features/projects/api";
import { cn } from "@/lib/utils";

function getUserInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "User";
  return source
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("") || "U";
}

function getCrumb(pathname: string): string {
  if (pathname.endsWith("/dashboard")) return "Overview";
  if (pathname.includes("/projects")) return "Projects";
  if (pathname.includes("/api")) return "MCP & API";
  if (pathname.includes("/upgrade")) return "Upgrade";
  if (pathname.includes("/settings")) return "Settings";
  if (pathname.startsWith("/account")) return "Account";
  if (pathname.startsWith("/admin")) return "Admin";
  return "Overview";
}

// ─── Search ───────────────────────────────────────────────────────────────────

function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { activeWorkspace } = useWorkspace();
  const wid = activeWorkspace?.workspace.id;

  const { data: allProjects } = useSWR(
    wid ? ["workspace-projects-search", wid] : null,
    () => browserProjectsApi.getProjects({ workspaceId: wid }),
    { revalidateOnFocus: false },
  );

  const results = query.trim().length > 0
    ? (allProjects ?? [])
        .filter((p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.slug.toLowerCase().includes(query.toLowerCase()) ||
          p.description?.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!wid) return null;

  return (
    <div ref={containerRef} className="relative hidden md:flex items-center gap-2 glass rounded-lg px-3 py-1.5 w-64 text-sm text-muted-foreground cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <Search className="size-4 shrink-0" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search projects…"
        className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70 text-foreground text-sm"
      />
      <kbd className="hidden lg:inline text-[10px] glass px-1.5 py-0.5 rounded font-mono select-none">⌘/</kbd>

      {open && query.trim().length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border glass-card shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No projects found</p>
          ) : (
            <ul>
              {results.map((project) => (
                <li key={project.id}>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => {
                      setQuery(""); setOpen(false);
                      router.push(`/w/${project.workspaceId}/projects/${project.id}`);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/[0.05] transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{project.name}</span>
                      {project.description && (
                        <span className="block truncate text-xs text-muted-foreground">{project.description}</span>
                      )}
                    </span>
                    <span className={cn(
                      "shrink-0 text-xs",
                      project.status === "ready" ? "text-accent-emerald"
                        : project.status === "failed" ? "text-destructive"
                        : "text-muted-foreground",
                    )}>
                      {project.status}
                    </span>
                  </Button>
                </li>
              ))}
              <li className="border-t border-border/60">
                <Link
                  href={`/w/${wid}/projects?q=${encodeURIComponent(query)}`}
                  onClick={() => { setOpen(false); setQuery(""); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Search className="size-3" />
                  See all results for "{query}"
                </Link>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function importStatusIcon(status: string) {
  if (status === "completed") return <CheckCircle2 className="size-3.5 text-accent-emerald shrink-0" />;
  if (status === "failed")    return <XCircle      className="size-3.5 text-destructive shrink-0" />;
  if (status === "running")   return <Loader2      className="size-3.5 animate-spin text-accent-cyan shrink-0" />;
  return <Clock className="size-3.5 text-muted-foreground shrink-0" />;
}

function formatRelativeTime(value: string): string {
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function NotificationBell() {
  const { activeWorkspace } = useWorkspace();
  const wid = activeWorkspace?.workspace.id;

  const { data: projects } = useSWR(
    wid ? ["workspace-projects-notifications", wid] : null,
    () => browserProjectsApi.getProjects({ workspaceId: wid, include: ["latestImport"] }),
    {
      revalidateOnFocus: true,
      refreshInterval: (data) => {
        const hasActive = (data ?? []).some((p) => {
          const imp = (p as ProjectListItem & { latestImport?: { status: string } | null }).latestImport;
          return imp?.status === "queued" || imp?.status === "pending" || imp?.status === "running";
        });
        return hasActive ? 3000 : 0;
      },
    },
  );

  const recentImports = (projects ?? [])
    .flatMap((p) => {
      const imp = (p as ProjectListItem & { latestImport?: { status: string; startedAt: string } | null }).latestImport;
      if (!imp) return [];
      return [{ projectName: p.name, projectId: p.id, status: imp.status, startedAt: imp.startedAt }];
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 8);

  const activeCount = recentImports.filter(
    (i) => i.status === "running" || i.status === "queued" || i.status === "pending",
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative size-9 rounded-lg glass hover:bg-white/[0.06] transition flex items-center justify-center">
          <Bell className="size-4 text-muted-foreground" />
          {activeCount > 0 ? (
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-accent-cyan shadow-[0_0_6px_#5dd6e0]" />
          ) : recentImports.length > 0 ? (
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-muted-foreground/40" />
          ) : null}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Recent imports
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recentImports.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">No recent imports</div>
        ) : (
          recentImports.map((item) => (
            <DropdownMenuItem key={`${item.projectId}-${item.startedAt}`} asChild>
              <Link href={`/w/${wid}/projects/${item.projectId}`} className="flex items-center gap-2.5">
                {importStatusIcon(item.status)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.projectName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{item.status}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(item.startedAt)}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={wid ? `/w/${wid}/projects` : "/dashboard"} className="text-xs text-muted-foreground justify-center">
            View all projects
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main Topbar ──────────────────────────────────────────────────────────────

export function AppTopbar() {
  const pathname = usePathname();
  const title = getCrumb(pathname);
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { activeWorkspace } = useWorkspace();
  const wid = activeWorkspace?.workspace.id;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const userName   = user?.name?.trim()  || "CodeMap User";
  const userEmail  = user?.email?.trim() || "Signed in";
  const userImage  = user?.image || undefined;
  const userInitials = getUserInitials(user?.name, user?.email);
  const router = useRouter();

  async function signOut() {
    try {
      const res = await authClient.signOut();
      if (!res.error) { router.push("/auth"); router.refresh(); return; }
      toast({ title: "Error signing out", description: res.error.message, variant: "destructive" });
    } catch {
      toast({ title: "Error signing out", description: "Please try again.", variant: "destructive" });
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 px-4 lg:px-8 border-b border-border/60 bg-background/60 backdrop-blur-[20px]">
      <MobileMenuButton />

      {/* Workspace chip — desktop */}
      {activeWorkspace && (
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg glass text-sm">
          <span className="size-4 rounded bg-gradient-to-br from-accent-violet/80 to-accent-cyan/40 shrink-0" />
          <span className="font-medium truncate max-w-[120px]">
            {activeWorkspace.workspace.name}
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
        </div>
      )}

      <h1 className="text-[15px] font-medium tracking-tight">{title}</h1>

      <div className="flex-1" />

      <GlobalSearch />

      {/* Theme toggle */}
      <Button variant="ghost"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="size-9 rounded-lg glass hover:bg-white/[0.06] transition flex items-center justify-center"
        title={mounted ? (theme === "dark" ? "Switch to light" : "Switch to dark") : "Toggle theme"}
      >
        {mounted && theme === "dark"
          ? <Sun  className="size-4 text-muted-foreground" />
          : <Moon className="size-4 text-muted-foreground" />}
        <span className="sr-only">Toggle theme</span>
      </Button>

      <NotificationBell />

      {/* User avatar */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-9 rounded-lg overflow-hidden ring-1 ring-border/60 hover:ring-accent-violet/40 transition">
            <Avatar className="size-9">
              <AvatarImage src={userImage} alt={userName} />
              <AvatarFallback className="bg-gradient-to-br from-accent-violet/40 to-accent-cyan/20 text-xs font-medium">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{isPending ? "Loading…" : userName}</span>
              <span className="text-xs text-muted-foreground">{isPending ? "Fetching session" : userEmail}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={wid ? `/w/${wid}/projects` : "/dashboard"}>Projects</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/account/settings">Account</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-destructive">
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
