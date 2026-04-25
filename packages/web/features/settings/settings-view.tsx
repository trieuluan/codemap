"use client";

import { useState } from "react";
import {
  CreditCard,
  KeyRound,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AccountSection } from "./components/account-section";
import { ApiKeysSection } from "./components/api-keys-section";
import { TeamSection } from "./components/team-section";
import { BillingSection } from "./components/billing-section";

type SectionId = "account" | "api-keys" | "team" | "billing";

type SectionDef = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
};

const SECTIONS: SectionDef[] = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "team", label: "Team", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
];

export function SettingsView() {
  const [section, setSection] = useState<SectionId>("account");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage account defaults and access credentials for CodeMap.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav
          aria-label="Settings sections"
          className="flex flex-col gap-1 lg:sticky lg:top-20 lg:self-start"
        >
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          {section === "account" && <AccountSection />}
          {section === "api-keys" && <ApiKeysSection />}
          {section === "team" && <TeamSection />}
          {section === "billing" && <BillingSection />}
        </div>
      </div>
    </div>
  );
}
