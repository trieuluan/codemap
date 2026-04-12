import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  showText?: boolean
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex size-8 items-center justify-center rounded-lg bg-foreground">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3v18h18" className="stroke-background" />
          <path d="M7 12l4-4 4 4 5-5" className="stroke-background" />
          <circle cx="20" cy="7" r="2" className="fill-background stroke-background" />
        </svg>
      </div>
      {showText && (
        <span className="text-lg font-semibold tracking-tight">CodeMap</span>
      )}
    </div>
  )
}
