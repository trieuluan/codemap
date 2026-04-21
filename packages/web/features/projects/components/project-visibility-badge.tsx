import { Badge } from "@/components/ui/badge";
import type { ProjectVisibility } from "@/features/projects/api";
import { getProjectVisibilityLabel } from "../utils/project-helpers";

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
