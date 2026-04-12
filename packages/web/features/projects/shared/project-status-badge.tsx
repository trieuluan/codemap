import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/api/projects";
import { getProjectStatusLabel } from "./project-helpers";

const statusStyles: Record<ProjectStatus, string> = {
  draft: "border-border bg-secondary text-secondary-foreground",
  importing: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ready: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "border-destructive/20 bg-destructive/10 text-destructive",
  archived: "border-border bg-muted text-muted-foreground",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant="outline" className={cn("capitalize", statusStyles[status])}>
      {getProjectStatusLabel(status)}
    </Badge>
  );
}
