import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ProjectOverview } from "@/features/projects/detail/project-overview";
import { createServerProjectsApi, ProjectsApiError } from "@/features/projects/api";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const api = createServerProjectsApi({ cookieHeader: (await cookies()).toString() });

  try {
    const [project, firstPage] = await Promise.all([
      api.getProject(projectId),
      api.getProjectImportPage(projectId, { limit: 20 }),
    ]);

    return (
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/w/${workspaceId}/projects`}>Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{project.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <ProjectOverview
          initialProject={project}
          initialImports={firstPage.data}
          workspaceId={workspaceId}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof ProjectsApiError && error.statusCode === 404) notFound();
    throw error;
  }
}
