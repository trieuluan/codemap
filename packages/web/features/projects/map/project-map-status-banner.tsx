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
  const hasCompletedImport = imports.some((item) => item.status === "completed");
  const hasPreviewableSource = imports.some(
    (item) => item.status === "completed" && item.sourceAvailable,
  );

  if (
    project.status === "importing" ||
    latestImport?.status === "running" ||
    latestImport?.status === "pending"
  ) {
    return <ImportProgress project={project} latestImport={latestImport} />;
  }

  if (latestImport?.status === "failed" || project.status === "failed") {
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

  if (!hasCompletedImport) {
    return (
      <Alert>
        <Loader2 />
        <AlertTitle>No code map available yet</AlertTitle>
        <AlertDescription>
          Run an import to generate the first project map. Until then, this
          workspace will stay in an empty placeholder state.
        </AlertDescription>
      </Alert>
    );
  }

  if (!hasPreviewableSource) {
    return (
      <Alert>
        <Loader2 />
        <AlertTitle>Repository preview needs a fresh import</AlertTitle>
        <AlertDescription>
          This project has a completed map snapshot, but retained source is not
          available for file preview. Start a new import to enable file content
          browsing in this workspace.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
