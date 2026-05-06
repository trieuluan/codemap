"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceSettingsNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();

  const SECTIONS = [
    { id: "team", label: "Team", icon: Users, href: `/w/${workspaceId}/settings/team` },
    { id: "billing", label: "Billing", icon: CreditCard, href: `/w/${workspaceId}/settings/billing` },
    { id: "upgrade", label: "Upgrade", icon: Sparkles, href: `/w/${workspaceId}/upgrade` },
  ];

  return (
    <nav aria-label="Workspace settings" className="flex flex-col gap-1 lg:sticky lg:top-20 lg:self-start">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.id}
            href={s.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
