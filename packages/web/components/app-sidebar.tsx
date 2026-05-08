"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  FolderKanban,
  Code,
  Settings,
  HelpCircle,
  ShieldCheck,
  UserRound,
  Sparkles,
  Menu,
} from "lucide-react";
import { useAdminCheck } from "@/features/auth/use-admin-check";
import { useWorkspace } from "@/features/workspaces/workspace-context";

const workspaceNav = (wid: string) => [
  { name: "Overview",  href: `/w/${wid}/dashboard`,     icon: LayoutDashboard },
  { name: "Projects",  href: `/w/${wid}/projects`,      icon: FolderKanban },
  { name: "MCP",       href: `/w/${wid}/api`,           icon: Code },
  { name: "Upgrade",   href: `/w/${wid}/upgrade`,       icon: Sparkles },
  { name: "Settings",  href: `/w/${wid}/settings/team`, icon: Settings },
];

const accountNav = [
  { name: "Account", href: "/account/settings", icon: UserRound },
  { name: "Help",    href: "/help",             icon: HelpCircle },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItem({
  href,
  icon: Icon,
  name,
  active,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  name: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
        active
          ? "glass text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03] dark:hover:bg-white/[0.04]",
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <span>{name}</span>
      {active && (
        <span className="absolute right-3 size-1 rounded-full bg-accent-violet shadow-[0_0_8px_#a78bfa]" />
      )}
    </Link>
  );
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

function SidebarContent({
  wid,
  isAdmin,
  pathname,
  onNavigate,
}: {
  wid: string;
  isAdmin: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const nav = wid ? workspaceNav(wid) : [];

  return (
    <>
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {nav.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            name={item.name}
            active={isActive(pathname, item.href)}
            onClick={onNavigate}
          />
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-border/60 space-y-0.5">
        {isAdmin && (
          <NavItem
            href="/admin"
            icon={ShieldCheck}
            name="Admin"
            active={pathname === "/admin" || pathname.startsWith("/admin/")}
            onClick={onNavigate}
          />
        )}
        {accountNav.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            name={item.name}
            active={isActive(pathname, item.href)}
            onClick={onNavigate}
          />
        ))}
      </div>
    </>
  );
}

export function AppSidebar({ workspaceId: propWorkspaceId }: { workspaceId?: string }) {
  const pathname = usePathname();
  const { isAdmin } = useAdminCheck();
  const { activeWorkspace } = useWorkspace();
  const wid = propWorkspaceId ?? activeWorkspace?.workspace.id ?? "";

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-border/60 bg-background/40 backdrop-blur-[20px] lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border/60 px-6">
        <Link href={wid ? `/w/${wid}/dashboard` : "/dashboard"} className="flex items-center gap-2 group">
          <div className="relative">
            <Logo showText={false} size={22} />
            <div className="absolute inset-0 -z-10 blur-lg opacity-0 group-hover:opacity-100 transition-opacity bg-accent-violet/30" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">CodeMap</span>
        </Link>
      </div>

      <SidebarContent wid={wid} isAdmin={isAdmin} pathname={pathname} />
    </aside>
  );
}

// ─── Mobile sidebar (Sheet) ───────────────────────────────────────────────────

export function MobileMenuButton() {
  const pathname = usePathname();
  const { isAdmin } = useAdminCheck();
  const { activeWorkspace } = useWorkspace();
  const wid = activeWorkspace?.workspace.id ?? "";
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-background/80 backdrop-blur-xl border-border/60">
        <SheetHeader className="flex h-16 items-center border-b border-border/60 px-6">
          <SheetTitle asChild>
            <Link href={wid ? `/w/${wid}/dashboard` : "/dashboard"} onClick={() => setOpen(false)}>
              <Logo />
            </Link>
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col flex-1">
          <SidebarContent
            wid={wid}
            isAdmin={isAdmin}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
