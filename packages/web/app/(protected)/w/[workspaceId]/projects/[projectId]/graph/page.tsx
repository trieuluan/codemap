import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink,
  BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { CloudFeatureGate } from "@/components/cloud-feature-gate";
import { ProjectMapGraphView } from "@/features/projects/map/graph/project-map-graph-view";
import { ProjectMapHeader } from "@/features/projects/map/components/project-map-header";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { createServerProjectsApi, ProjectsApiError } from "@/features/projects/api";
import { createServerWorkspacesApi } from "@/features/workspaces/api";

export default async function ProjectGraphPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{ file?: string; symbol?: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const { file: initialFocusFile, symbol: initialFocusSymbol } = await searchParams;
  const cookieHeader = (await cookies()).toString();
  const api = createServerProjectsApi({ cookieHeader });
  const workspacesApi = createServerWorkspacesApi({ cookieHeader });

  try {
    const [project, firstPage, workspaceDetail] = await Promise.all([
      api.getProject(projectId),
      api.getProjectImportPage(projectId, { limit: 1 }),
      workspacesApi.getWorkspace(workspaceId),
    ]);
    if (project.workspaceId !== workspaceId) notFound();

    if (!workspaceDetail.entitlements.cloudImportAccess) {
      return (
        <CloudFeatureGate
          feature="Dependency Graph"
          projectUrl={`/w/${workspaceId}/projects/${project.id}`}
          upgradeUrl={`/w/${workspaceId}/upgrade`}
        />
      );
    }

    const graphData = await api.getProjectGraph(projectId);

    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href={`/w/${workspaceId}/projects`}>Projects</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild><Link href={`/w/${workspaceId}/projects/${project.id}`}>{project.name}</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Graph</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight">{project.name} graph</h1>
                <ProjectStatusBadge status={project.status} />
              </div>
              <p className="text-muted-foreground">Explore folder-level dependencies first, then drill into file-level graphs when needed.</p>
              <ProjectMapHeader projectId={project.id} active="graph" importId={firstPage.data[0]?.id} parseStatus={firstPage.data[0]?.parseStatus} workspaceId={workspaceId} />
            </div>
            <Button variant="outline" asChild>
              <Link href={`/w/${workspaceId}/projects/${project.id}`}><ArrowLeft className="size-4" />Back to project</Link>
            </Button>
          </div>
        </div>
        <ProjectMapGraphView projectId={project.id} graphData={graphData} initialFocusFile={initialFocusFile} initialFocusSymbol={initialFocusSymbol} workspaceId={workspaceId} />
      </div>
    );
  } catch (error) {
    if (error instanceof ProjectsApiError && error.statusCode === 404) notFound();
    throw error;
  }
}
