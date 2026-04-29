import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  createServerProjectsApi,
  ProjectsApiError,
} from "@/features/projects/api";
import { ProjectHistoryView } from "@/features/projects/history/project-history-view";

export default async function ProjectHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const api = createServerProjectsApi({
    cookieHeader: (await cookies()).toString(),
  });

  try {
    const [project, imports] = await Promise.all([
      api.getProject(projectId),
      api.getProjectImports(projectId),
    ]);

    return (
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/projects/${project.id}`}>{project.name}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>History</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Import history
            </h1>
            <p className="text-sm text-muted-foreground">
              Compare snapshots of <span className="font-medium text-foreground">{project.name}</span>{" "}
              over time — file, symbol and dependency changes between any two imports.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${project.id}`}>
              <ChevronLeft className="size-4" />
              Back to project
            </Link>
          </Button>
        </div>

        <ProjectHistoryView projectId={project.id} initialImports={imports} />
      </div>
    );
  } catch (error) {
    if (error instanceof ProjectsApiError && error.statusCode === 404) {
      notFound();
    }
    throw error;
  }
}
