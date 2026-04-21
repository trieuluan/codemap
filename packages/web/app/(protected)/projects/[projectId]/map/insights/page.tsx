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
import { ProjectMapInsightsView } from "@/features/projects/map/insights/project-map-insights-view";
import { ProjectMapNav } from "@/features/projects/map/components/project-map-nav";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { createServerProjectsApi, ProjectsApiError } from "@/features/projects/api";

export default async function ProjectMapInsightsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const api = createServerProjectsApi({
    cookieHeader: (await cookies()).toString(),
  });

  try {
    const [project, imports, insights] = await Promise.all([
      api.getProject(projectId),
      api.getProjectImports(projectId),
      api.getProjectInsights(projectId),
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
                <BreadcrumbPage>Insights</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {project.name} insights
                </h1>
                <ProjectStatusBadge status={project.status} />
              </div>
              <p className="text-muted-foreground">
                Review dependency and structure insights before investing in
                graph visualizations.
              </p>
              <ProjectMapNav projectId={project.id} active="insights" />
            </div>

            <Button variant="outline" asChild>
              <Link href={`/projects/${project.id}`}>
                <ArrowLeft className="size-4" />
                Back to project
              </Link>
            </Button>
          </div>
        </div>

        <ProjectMapInsightsView
          project={project}
          imports={imports}
          insights={insights}
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
