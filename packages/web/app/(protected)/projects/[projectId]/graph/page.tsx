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
import { ProjectMapHeader } from "@/features/projects/map/components/project-map-header";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { createServerProjectsApi, ProjectsApiError } from "@/features/projects/api";

export default async function ProjectGraphPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ file?: string; symbol?: string }>;
}) {
  const { projectId } = await params;
  const { file: initialFocusFile, symbol: initialFocusSymbol } =
    await searchParams;
  const api = createServerProjectsApi({
    cookieHeader: (await cookies()).toString(),
  });

  try {
    const [project, imports, graphData] = await Promise.all([
      api.getProject(projectId),
      api.getProjectImports(projectId),
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
              <ProjectMapHeader
                projectId={project.id}
                active="graph"
                importId={imports[0]?.id}
                parseStatus={imports[0]?.parseStatus}
              />
            </div>

            <Button variant="outline" asChild>
              <Link href={`/projects/${project.id}`}>
                <ArrowLeft className="size-4" />
                Back to project
              </Link>
            </Button>
          </div>
        </div>

        <ProjectMapGraphView
          projectId={project.id}
          graphData={graphData}
          initialFocusFile={initialFocusFile}
          initialFocusSymbol={initialFocusSymbol}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof ProjectsApiError && error.statusCode === 404) {
      notFound();
    }
    throw error;
  }
}
