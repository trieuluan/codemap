import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ProjectOverview } from "@/features/projects/detail/project-overview";
import { createServerProjectsApi, ProjectsApiError } from "@/features/projects/api";
import { createServerWorkspacesApi } from "@/features/workspaces/api";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const cookieHeader = (await cookies()).toString();
  const api = createServerProjectsApi({ cookieHeader });
  const workspacesApi = createServerWorkspacesApi({ cookieHeader });

  try {
    const [project, firstPage, workspaceDetail] = await Promise.all([
      api.getProject(projectId),
      api.getProjectImportPage(projectId, { limit: 20 }),
      workspacesApi.getWorkspace(workspaceId),
    ]);
    if (project.workspaceId !== workspaceId) notFound();

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
          entitlements={workspaceDetail.entitlements}
          usage={workspaceDetail.usage}
          workspaceId={workspaceId}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof ProjectsApiError && error.statusCode === 404) notFound();
    throw error;
  }
}
