"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound, Link2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "settings", label: "Account", icon: UserRound, href: "/account/settings" },
  { id: "api-keys", label: "API Keys", icon: KeyRound, href: "/account/api-keys" },
  { id: "integrations", label: "Integrations", icon: Link2, href: "/account/integrations" },
];

export function AccountSettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account settings" className="flex flex-col gap-1 lg:sticky lg:top-20 lg:self-start">
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
