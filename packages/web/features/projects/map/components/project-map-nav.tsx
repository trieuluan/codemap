import Link from "next/link";
import { cn } from "@/lib/utils";

export function ProjectMapNav({
  projectId,
  active,
}: {
  projectId: string;
  active: "mapping" | "insights" | "graph";
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/30 p-1">
      <Link
        href={`/projects/${projectId}/explorer`}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm transition-colors",
          active === "mapping"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Mapping
      </Link>
      <Link
        href={`/projects/${projectId}/insights`}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm transition-colors",
          active === "insights"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Insights
      </Link>
      <Link
        href={`/projects/${projectId}/graph`}
        className={cn(
          "rounded-md px-3 py-1.5 text-sm transition-colors",
          active === "graph"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Graph
      </Link>
    </div>
  );
}
