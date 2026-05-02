"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import {
  LayoutDashboard,
  FolderKanban,
  Code,
  Settings,
  HelpCircle,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAdminCheck } from "@/features/auth/use-admin-check";
import { useWorkspace } from "@/features/workspaces/workspace-context";

const workspaceNav = (wid: string) => [
  { name: "Overview", href: `/w/${wid}/dashboard`, icon: LayoutDashboard },
  { name: "Projects", href: `/w/${wid}/projects`, icon: FolderKanban },
  { name: "API", href: `/w/${wid}/api`, icon: Code },
  { name: "Settings", href: `/w/${wid}/settings/team`, icon: Settings },
];

const accountNav = [
  { name: "Account", href: "/account/settings", icon: UserRound },
  { name: "Help", href: "/help", icon: HelpCircle },
];

export function DashboardSidebar({ workspaceId: propWorkspaceId }: { workspaceId?: string }) {
  const pathname = usePathname();
  const { isAdmin } = useAdminCheck();
  const { activeWorkspace } = useWorkspace();
  const wid = propWorkspaceId ?? activeWorkspace?.workspace.id ?? "";

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href={wid ? `/w/${wid}/dashboard` : "/dashboard"}>
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        <div className="space-y-1">
          {wid && workspaceNav(wid).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto space-y-1">
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === "/admin" || pathname.startsWith("/admin/")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <ShieldCheck className="size-4" />
              Admin
            </Link>
          )}
          {accountNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
