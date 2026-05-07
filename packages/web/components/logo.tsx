import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: number;
}

export function Logo({ className, showText = true, size = 22 }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6"  cy="6"  r="2.5" stroke="#5dd6e0" />
        <circle cx="18" cy="6"  r="2.5" stroke="#a78bfa" />
        <circle cx="12" cy="18" r="2.5" stroke="currentColor" />
        <path d="M8 7l8 0M7.5 8 12 16M16.5 8 12.5 16" stroke="currentColor" strokeOpacity={0.4} />
      </svg>
      {showText && (
        <span className="font-semibold tracking-tight">CodeMap</span>
      )}
    </div>
  );
}
