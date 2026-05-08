import { cn } from "@/lib/utils";
import { ReactNode, HTMLAttributes } from "react";

// ─── GlassCard ────────────────────────────────────────────────────────────────

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

export function GlassCard({ children, className, hover, ...props }: GlassCardProps) {
  return (
    <div
      className={cn(
        "glass-card p-6 transition-all",
        hover && "hover:bg-white/[0.04] hover:-translate-y-0.5 cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── GlassStatCard ────────────────────────────────────────────────────────────
// Renamed from StatCard to avoid conflict with features/projects/detail/components/stat-card.tsx

export function GlassStatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && (
          <div className="size-9 rounded-lg glass flex items-center justify-center text-accent-violet">
            {icon}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
// Renamed from Badge to avoid conflict with @/components/ui/badge

export function StatusBadge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "accent" | "destructive";
}) {
  const styles: Record<string, string> = {
    default:     "bg-white/5 text-muted-foreground border-white/10",
    success:     "bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20",
    warning:     "bg-accent-amber/10 text-accent-amber border-accent-amber/20",
    accent:      "bg-accent-violet/15 text-accent-violet border-accent-violet/30",
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        styles[variant],
      )}
    >
      {children}
    </span>
  );
}
