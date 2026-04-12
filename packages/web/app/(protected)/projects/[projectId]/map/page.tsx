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
import { ProjectMapShell } from "@/features/projects/map/project-map-shell";
import { ProjectStatusBadge } from "@/features/projects/shared/project-status-badge";
import {
  getProject,
  getProjectImports,
  ProjectsApiError,
} from "@/lib/api/projects";

export default async function ProjectMapPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const cookieHeader = (await cookies()).toString();

  try {
    const [project, imports] = await Promise.all([
      getProject(projectId, { cookieHeader }),
      getProjectImports(projectId, { cookieHeader }),
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
                <BreadcrumbPage>Mapping</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {project.name} mapping
                </h1>
                <ProjectStatusBadge status={project.status} />
              </div>
              <p className="text-muted-foreground">
                Explore the project structure, dependency surface, and likely
                entry points.
              </p>
            </div>

            <Button variant="outline" asChild>
              <Link href={`/projects/${project.id}`}>
                <ArrowLeft className="size-4" />
                Back to project
              </Link>
            </Button>
          </div>
        </div>

        <ProjectMapShell project={project} imports={imports} />
      </div>
    );
  } catch (error) {
    if (error instanceof ProjectsApiError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
