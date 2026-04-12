import { Badge } from "@/components/ui/badge";
import type { ProjectVisibility } from "@/lib/api/projects";
import { getProjectVisibilityLabel } from "./project-helpers";

export function ProjectVisibilityBadge({
  visibility,
}: {
  visibility: ProjectVisibility;
}) {
  return (
    <Badge variant="outline" className="capitalize">
      {getProjectVisibilityLabel(visibility)}
    </Badge>
  );
}
