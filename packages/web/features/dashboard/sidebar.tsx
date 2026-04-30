"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import {
  LayoutDashboard,
  FolderKanban,
  Code,
  Users,
  Settings,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { useAdminCheck } from "@/features/auth/use-admin-check";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderKanban },
  { name: "API", href: "/api", icon: Code },
  { name: "Team", href: "/settings/team", icon: Users },
];

const secondaryNavigation = [
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Help", href: "/help", icon: HelpCircle },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAdminCheck();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/dashboard">
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive =
              item.href === "/projects"
                ? pathname === item.href || pathname.startsWith("/projects/")
                : item.href === "/dashboard"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
          {secondaryNavigation.map((item) => {
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
