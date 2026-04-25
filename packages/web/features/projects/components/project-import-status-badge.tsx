import { Badge } from "@/components/ui/badge";
import type { ProjectImportStatus } from "@/features/projects/api";
import { cn } from "@/lib/utils";
import { getProjectImportStatusLabel } from "../utils/project-helpers";

const statusStyles: Record<ProjectImportStatus, string> = {
  pending:
    "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  queued:
    "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  running: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  completed:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "border-destructive/20 bg-destructive/10 text-destructive",
};

export function ProjectImportStatusBadge({
  status,
}: {
  status: ProjectImportStatus;
}) {
  return (
    <Badge variant="outline" className={cn("capitalize", statusStyles[status])}>
      {getProjectImportStatusLabel(status)}
    </Badge>
  );
}
