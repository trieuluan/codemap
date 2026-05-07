import * as React from "react";

export type IconName =
  | "arrow-right" | "arrow-up-right" | "check" | "x" | "sparkle" | "github"
  | "terminal" | "graph" | "search" | "branch" | "shield" | "layers" | "cpu"
  | "bolt" | "compass" | "alert" | "spark-zap" | "play" | "code" | "file"
  | "globe" | "package" | "play-circle" | "chevron-down" | "git-merge" | "filter";

interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
  className,
  ...rest
}: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    ...rest,
  };
  switch (name) {
    case "arrow-right":      return (<svg {...common}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>);
    case "arrow-up-right":   return (<svg {...common}><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>);
    case "check":            return (<svg {...common}><path d="m5 12 5 5L20 7"/></svg>);
    case "x":                return (<svg {...common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>);
    case "sparkle":          return (<svg {...common}><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M5.5 5.5 8 8"/><path d="m16 16 2.5 2.5"/><path d="M5.5 18.5 8 16"/><path d="m16 8 2.5-2.5"/></svg>);
    case "github":           return (<svg {...common} fill="currentColor" stroke="none"><path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.5 2.87 8.32 6.84 9.66.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.46-1.18-1.11-1.49-1.11-1.49-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.74-.1-.26-.45-1.31.1-2.72 0 0 .84-.27 2.75 1.05A9.34 9.34 0 0 1 12 7.07c.85.005 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.46.1 2.72.64.71 1.03 1.62 1.03 2.74 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10 10 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"/></svg>);
    case "terminal":         return (<svg {...common}><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>);
    case "graph":            return (<svg {...common}><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5 16 7.5M7 8l4.5 8M17 8 12.5 16"/></svg>);
    case "search":           return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    case "branch":           return (<svg {...common}><circle cx="6" cy="3" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="18" cy="6" r="1.6"/><path d="M6 4.6v11.8"/><path d="M18 7.6c0 4.4-4 4.4-6 4.4-2 0-6 0-6 4.4"/></svg>);
    case "shield":           return (<svg {...common}><path d="M12 2 4 5v6c0 5 3.5 9.4 8 11 4.5-1.6 8-6 8-11V5l-8-3Z"/></svg>);
    case "layers":           return (<svg {...common}><path d="m12 3 9 4.5L12 12 3 7.5 12 3Z"/><path d="M3 12.5 12 17l9-4.5"/><path d="M3 17 12 21.5 21 17"/></svg>);
    case "cpu":              return (<svg {...common}><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>);
    case "bolt":             return (<svg {...common}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>);
    case "compass":          return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-6 2 2-6 6-2Z"/></svg>);
    case "alert":            return (<svg {...common}><path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".5" fill="currentColor"/></svg>);
    case "spark-zap":        return (<svg {...common}><path d="m13 2-9 14h7l-1 6 9-14h-7l1-6Z"/></svg>);
    case "play":             return (<svg {...common}><path d="M6 4v16l14-8L6 4Z" fill="currentColor"/></svg>);
    case "code":             return (<svg {...common}><path d="m8 6-6 6 6 6"/><path d="m16 6 6 6-6 6"/></svg>);
    case "file":             return (<svg {...common}><path d="M14 3H6v18h12V7l-4-4Z"/><path d="M14 3v4h4"/></svg>);
    case "globe":            return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18A14 14 0 0 1 12 3Z"/></svg>);
    case "package":          return (<svg {...common}><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/></svg>);
    case "play-circle":      return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z" fill="currentColor"/></svg>);
    case "chevron-down":     return (<svg {...common}><path d="m6 9 6 6 6-6"/></svg>);
    case "git-merge":        return (<svg {...common}><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8"/><path d="M6 8c0 6 6 6 10 10"/></svg>);
    case "filter":           return (<svg {...common}><path d="M3 4h18l-7 9v6l-4 2v-8L3 4Z"/></svg>);
    default:                 return null;
  }
}
