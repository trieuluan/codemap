import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ProjectMapGraphView } from "@/features/projects/map/graph/project-map-graph-view";
import { ProjectMapNav } from "@/features/projects/map/components/project-map-nav";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { createServerProjectsApi, ProjectsApiError } from "@/features/projects/api";

export default async function ProjectMapGraphPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const api = createServerProjectsApi({
    cookieHeader: (await cookies()).toString(),
  });

  try {
    const [project, graphData] = await Promise.all([
      api.getProject(projectId),
      api.getProjectGraph(projectId),
    ]);

    return (
      <div className="space-y-6">
        <div className="space-y-4">
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
                <BreadcrumbPage>Graph</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {project.name} graph
                </h1>
                <ProjectStatusBadge status={project.status} />
              </div>
              <p className="text-muted-foreground">
                Explore folder-level dependencies first, then drill into
                file-level graphs when needed.
              </p>
              <ProjectMapNav projectId={project.id} active="graph" />
            </div>

            <Button variant="outline" asChild>
              <Link href={`/projects/${project.id}`}>
                <ArrowLeft className="size-4" />
                Back to project
              </Link>
            </Button>
          </div>
        </div>

        <ProjectMapGraphView projectId={project.id} graphData={graphData} />
      </div>
    );
  } catch (error) {
    if (error instanceof ProjectsApiError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
