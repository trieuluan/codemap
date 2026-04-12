import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Project, ProjectImport } from "@/lib/api/projects";
import { getLatestProjectImport } from "../shared/project-helpers";
import { ImportProgress } from "./import-progress";

export function ProjectMapStatusBanner({
  project,
  imports,
}: {
  project: Project;
  imports: ProjectImport[];
}) {
  const latestImport = getLatestProjectImport(imports);

  if (project.status === "importing") {
    return <ImportProgress project={project} latestImport={latestImport} />;
  }

  if (project.status === "failed") {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Latest import failed</AlertTitle>
        <AlertDescription>
          {latestImport?.errorMessage ||
            "The latest import did not complete successfully."}
        </AlertDescription>
      </Alert>
    );
  }

  if (project.status === "draft") {
    return (
      <Alert>
        <Loader2 className="animate-spin" />
        <AlertTitle>Project is not imported yet</AlertTitle>
        <AlertDescription>
          The map below is still mock data. Trigger a repository import from the
          project overview page to start processing real repository metadata.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
