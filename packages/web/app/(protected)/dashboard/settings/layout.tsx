import { SettingsNav } from "@/features/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage account defaults and access credentials for CodeMap.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <SettingsNav />
        <div className="min-w-0 space-y-4">{children}</div>
      </div>
    </div>
  );
}
