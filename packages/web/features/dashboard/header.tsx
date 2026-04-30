"use client";

import { Bell, CheckCircle2, Clock, Loader2, Moon, Search, Sun, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MobileSidebar } from "./mobile-sidebar";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/ui/use-toast";
import { browserProjectsApi, type ProjectListItem } from "@/features/projects/api";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  title?: string;
}

function getUserInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "User";
  const words = source
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase())
    .filter(Boolean);
  return words.slice(0, 2).join("") || "U";
}

// ─── Global search ────────────────────────────────────────────────────────────

function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: allProjects } = useSWR(
    "global-projects-search",
    () => browserProjectsApi.getProjects(),
    { revalidateOnFocus: false },
  );

  const results =
    query.trim().length > 0
      ? (allProjects ?? [])
          .filter(
            (p) =>
              p.name.toLowerCase().includes(query.toLowerCase()) ||
              p.slug.toLowerCase().includes(query.toLowerCase()) ||
              p.description?.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 6)
      : [];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(project: ProjectListItem) {
    setQuery("");
    setOpen(false);
    router.push(`/projects/${project.id}`);
  }

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search projects…"
        className="w-64 bg-secondary border-border pl-8 pr-12"
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground/60 select-none">
        ⌘/
      </span>

      {open && query.trim().length > 0 ? (
        <div className="absolute top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              No projects found
            </p>
          ) : (
            <ul>
              {results.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(project)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{project.name}</span>
                      {project.description ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {project.description}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        project.status === "ready"
                          ? "text-emerald-500"
                          : project.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {project.status}
                    </span>
                  </button>
                </li>
              ))}
              <li className="border-t border-border/70">
                <Link
                  href={`/projects?q=${encodeURIComponent(query)}`}
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
      ) : null}
    </div>
  );
}

// ─── Bell / Notifications ─────────────────────────────────────────────────────

function importStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />;
    case "failed":
      return <XCircle className="size-3.5 text-destructive shrink-0" />;
    case "running":
      return <Loader2 className="size-3.5 animate-spin text-blue-500 shrink-0" />;
    default:
      return <Clock className="size-3.5 text-muted-foreground shrink-0" />;
  }
}

function NotificationBell() {
  const { data: projects } = useSWR(
    "global-projects-search",
    () => browserProjectsApi.getProjects({ include: ["latestImport"] }),
    {
      revalidateOnFocus: true,
      refreshInterval: 10000,
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
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {activeCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-blue-500" />
          ) : recentImports.length > 0 ? (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-muted-foreground/40" />
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
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No recent imports
          </div>
        ) : (
          recentImports.map((item) => (
            <DropdownMenuItem key={`${item.projectId}-${item.startedAt}`} asChild>
              <Link
                href={`/projects/${item.projectId}`}
                className="flex items-center gap-2.5"
              >
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
          <Link href="/projects" className="text-xs text-muted-foreground justify-center">
            View all projects
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatRelativeTime(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ─── Main Header ──────────────────────────────────────────────────────────────

export function DashboardHeader({ title = "Overview" }: DashboardHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const userName = user?.name?.trim() || "CodeMap User";
  const userEmail = user?.email?.trim() || "Signed in";
  const userImage = user?.image || undefined;
  const userInitials = getUserInitials(user?.name, user?.email);

  async function signOut() {
    try {
      const response = await authClient.signOut();
      if (!response.error) {
        router.push("/auth");
        router.refresh();
        return;
      }
      toast({
        title: "Error signing out",
        description: response.error.message || "Unable to sign out right now.",
        variant: "destructive",
      });
    } catch {
      toast({
        title: "Error signing out",
        description: "An error occurred while trying to sign out. Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background px-4 lg:px-6">
      <MobileSidebar />

      <h1 className="text-lg font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <GlobalSearch />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={mounted ? (theme === "dark" ? "Switch to light" : "Switch to dark") : "Toggle theme"}
        >
          {mounted && theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="size-8">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <span className="sr-only">User menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {isPending ? "Loading..." : userName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {isPending ? "Fetching session" : userEmail}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/projects">Projects</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
