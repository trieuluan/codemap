import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Network } from "lucide-react";
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

    if (!workspaceDetail.entitlements.graphAccess) {
      return (
        <CloudFeatureGate
          feature="Dependency Graph"
          projectUrl={`/w/${workspaceId}/projects/${project.id}`}
          upgradeUrl={`/w/${workspaceId}/upgrade`}
        />
      );
    }

    const latestImport = firstPage.data[0];
    const isIndexed =
      latestImport?.parseStatus === "completed" ||
      latestImport?.parseStatus === "partial";

    const pageHeader = (
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
            <ProjectMapHeader projectId={project.id} active="graph" importId={latestImport?.id} parseStatus={latestImport?.parseStatus} workspaceId={workspaceId} />
          </div>
          <Button variant="outline" asChild>
            <Link href={`/w/${workspaceId}/projects/${project.id}`}><ArrowLeft className="size-4" />Back to project</Link>
          </Button>
        </div>
      </div>
    );

    if (!isIndexed) {
      return (
        <div className="space-y-6">
          {pageHeader}
          <div className="flex flex-col items-center justify-center rounded-lg border border-border/70 bg-muted/20 py-20 text-center space-y-4">
            <Network className="size-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">Graph not available yet</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {!latestImport
                  ? "This project hasn't been imported yet. Start an import from the project page."
                  : "The semantic index isn't ready yet. Check back once the import completes."}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/w/${workspaceId}/projects/${project.id}`}><ArrowLeft className="size-3.5" />Back to project</Link>
            </Button>
          </div>
        </div>
      );
    }

    const graphData = await api.getProjectGraph(projectId);

    return (
      <div className="space-y-6">
        {pageHeader}
        <ProjectMapGraphView projectId={project.id} graphData={graphData} initialFocusFile={initialFocusFile} initialFocusSymbol={initialFocusSymbol} workspaceId={workspaceId} />
      </div>
    );
  } catch (error) {
    if (error instanceof ProjectsApiError && error.statusCode === 404) notFound();
    throw error;
  }
}
