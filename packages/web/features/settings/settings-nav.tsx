"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, KeyRound, Users, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "account", label: "Account", icon: UserRound, href: "/dashboard/settings/account" },
  { id: "api-keys", label: "API Keys", icon: KeyRound, href: "/dashboard/settings/api-keys" },
  { id: "team", label: "Team", icon: Users, href: "/dashboard/settings/team" },
  { id: "billing", label: "Billing", icon: CreditCard, href: "/dashboard/settings/billing" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-col gap-1 lg:sticky lg:top-20 lg:self-start"
    >
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.id}
            href={s.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
