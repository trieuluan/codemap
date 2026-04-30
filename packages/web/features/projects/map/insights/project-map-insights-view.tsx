import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  FolderTree,
  GitBranch,
  ScanSearch,
  Sparkles,
  Unplug,
} from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import type {
  Project,
  ProjectInsightFocusedEdgeFile,
  ProjectImport,
  ProjectMapInsightsResponse,
} from "@/features/projects/api";
import { ProjectMapStatusBanner } from "../components/status/project-map-status-banner";

function getFocusSections(
  insights: ProjectMapInsightsResponse,
  focusFile?: string | null,
) {
  if (!focusFile) {
    return [];
  }

  const sections: string[] = [];
  const topFilesByImportCount = insights.topFilesByImportCount ?? [];
  const topFilesByInboundDependencyCount =
    insights.topFilesByInboundDependencyCount ?? [];
  const orphanFiles = insights.orphanFiles ?? [];
  const entryLikeFiles = insights.entryLikeFiles ?? [];
  const circularDependencyCandidates =
    insights.circularDependencyCandidates ?? [];

  if (topFilesByImportCount.some((item) => item.path === focusFile)) {
    sections.push("Top files by imports");
  }

  if (
    topFilesByInboundDependencyCount.some((item) => item.path === focusFile)
  ) {
    sections.push("Top files by inbound dependencies");
  }

  if (orphanFiles.some((item) => item.path === focusFile)) {
    sections.push("Orphan files");
  }

  if (entryLikeFiles.some((item) => item.path === focusFile)) {
    sections.push("Entry-like files");
  }

  if (
    circularDependencyCandidates.some((item) => item.paths.includes(focusFile))
  ) {
    sections.push("Circular dependency candidates");
  }

  return sections;
}

function InsightCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-card p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyInsight({ title }: { title: string }) {
  return (
    <Empty className="min-h-[120px] rounded-lg border border-dashed border-border bg-background/40 p-6">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>No results to show yet.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function buildInsightsFileHref(projectId: string, filePath: string) {
  return `/projects/${projectId}/insights?file=${encodeURIComponent(filePath)}`;
}

function FileInsightList({
  projectId,
  items,
  metricLabel,
  focusFile,
}: {
  projectId: string;
  items: Array<{
    path: string;
    language: string | null;
    incomingCount: number;
    outgoingCount: number;
  }>;
  metricLabel: (item: {
    incomingCount: number;
    outgoingCount: number;
  }) => string;
  focusFile?: string | null;
}) {
  if ((items ?? []).length === 0) {
    return <EmptyInsight title="No files found" />;
  }

  return (
    <div className="space-y-2">
      {(items ?? []).map((item, index) => (
        <Link
          key={`${item.path}:${index}`}
          href={buildInsightsFileHref(projectId, item.path)}
          className={cn(
            "flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3 transition-colors hover:bg-accent/40",
            focusFile === item.path &&
              "border-primary/60 bg-primary/5 ring-1 ring-primary/30",
          )}
        >
          <div className="min-w-0 space-y-1">
            <p className="break-all font-mono text-xs text-foreground">
              {item.path}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.language ?? "Unknown language"} • {metricLabel(item)}
            </p>
          </div>
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

function FocusedEdgeList({
  projectId,
  items,
  emptyLabel,
}: {
  projectId: string;
  items: ProjectInsightFocusedEdgeFile[];
  emptyLabel: string;
}) {
  if ((items ?? []).length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {(items ?? []).map((item, index) => (
        <Link
          key={`${item.path}:${item.moduleSpecifier}:${index}`}
          href={buildInsightsFileHref(projectId, item.path)}
          className="block rounded-md border border-border/70 bg-background/70 p-2 transition-colors hover:bg-accent/40"
        >
          <p className="break-all font-mono text-xs text-foreground">
            {item.path}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.importKind} • {item.moduleSpecifier}
            {(item.importedNames ?? []).length
              ? ` • ${item.importedNames.join(", ")}`
              : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}

export function ProjectMapInsightsView({
  project,
  imports,
  insights,
  focusFile,
  focusSymbol,
}: {
  project: Project;
  imports: ProjectImport[];
  insights: ProjectMapInsightsResponse;
  focusFile?: string | null;
  focusSymbol?: string | null;
}) {
  const focusSections = getFocusSections(insights, focusFile);
  const focusedFile = insights.focusedFile;
  const hasFocusedFile = Boolean(focusedFile);
  const languageDistribution = insights.languageDistribution ?? [];
  const parseStatusBreakdown = insights.parseStatusBreakdown ?? [];
  const recommendations = insights.recommendations ?? [];
  const topFilesByImportCount = insights.topFilesByImportCount ?? [];
  const topFilesByInboundDependencyCount =
    insights.topFilesByInboundDependencyCount ?? [];
  const topFoldersBySourceFileCount =
    insights.topFoldersBySourceFileCount ?? [];
  const orphanFiles = insights.orphanFiles ?? [];
  const entryLikeFiles = insights.entryLikeFiles ?? [];
  const circularDependencyCandidates =
    insights.circularDependencyCandidates ?? [];

  return (
    <div className="space-y-6">
      <ProjectMapStatusBanner
        project={project}
        imports={imports}
        mapSnapshot={null}
      />

      {focusFile ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 ring-1 ring-primary/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Focus context
              </p>
              {focusSymbol ? (
                <p className="text-sm font-medium text-foreground">
                  {focusSymbol}
                </p>
              ) : null}
              <p className="break-all font-mono text-xs text-foreground">
                {focusFile}
              </p>
              {focusedFile ? (
                <>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{focusedFile.language ?? "Unknown language"}</span>
                    <span>•</span>
                    <span>{focusedFile.incomingCount} incoming</span>
                    <span>•</span>
                    <span>{focusedFile.outgoingCount} outgoing</span>
                    {focusedFile.isOrphan ? (
                      <>
                        <span>•</span>
                        <span>orphan</span>
                      </>
                    ) : null}
                    {focusedFile.isEntryLike ? (
                      <>
                        <span>•</span>
                        <span>entry-like</span>
                      </>
                    ) : null}
                    {(focusedFile.cycles ?? []).length ? (
                      <>
                        <span>•</span>
                        <span>
                          {(focusedFile.cycles ?? []).length} cycle candidate
                        </span>
                      </>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {focusSections.length
                      ? `Appears in ${focusSections.join(", ")}.`
                      : "This file is not in the current top insight lists, but it was found in the latest index."}
                  </p>
                  {focusedFile.entryLikeReason ? (
                    <p className="text-xs text-muted-foreground">
                      {focusedFile.entryLikeReason}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This file was not found in the latest indexed project map.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href={`/projects/${project.id}/insights`}
                className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Clear focus
              </Link>
              <Link
                href={`/projects/${project.id}/explorer?path=${encodeURIComponent(focusFile)}`}
                className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Open in Explorer
              </Link>
              <Link
                href={`/projects/${project.id}/graph?file=${encodeURIComponent(focusFile)}`}
                className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Focus in Graph
              </Link>
            </div>
          </div>
          {focusedFile ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Direct importers
                </p>
                <FocusedEdgeList
                  projectId={project.id}
                  items={focusedFile.directImporters ?? []}
                  emptyLabel="No indexed internal files import this file."
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Direct dependencies
                </p>
                <FocusedEdgeList
                  projectId={project.id}
                  items={focusedFile.directDependencies ?? []}
                  emptyLabel="This file has no indexed internal dependencies."
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <InsightCard
          title="Parse & language quality"
          description="Language distribution and parser coverage in the latest index."
          icon={<ScanSearch className="size-5 text-muted-foreground" />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Languages
              </p>
              {languageDistribution.length === 0 ? (
                <EmptyInsight title="No language data found" />
              ) : (
                languageDistribution.slice(0, 8).map((item) => (
                  <div
                    key={item.language}
                    className="flex items-center justify-between rounded-md border border-border/70 bg-background/70 px-3 py-2"
                  >
                    <span className="text-sm text-foreground">
                      {item.language}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.fileCount}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Parse status
              </p>
              {parseStatusBreakdown.map((item) => (
                <div
                  key={item.status}
                  className="flex items-center justify-between rounded-md border border-border/70 bg-background/70 px-3 py-2"
                >
                  <span className="text-sm text-foreground">
                    {item.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {item.fileCount}
                  </span>
                </div>
              ))}
              <div className="mt-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                {insights.unresolvedImportCount ?? 0} unresolved imports •{" "}
                {insights.externalImportCount ?? 0} external imports
              </div>
            </div>
          </div>
        </InsightCard>

        <InsightCard
          title={
            hasFocusedFile ? "Focused next actions" : "Recommended next actions"
          }
          description={
            hasFocusedFile
              ? "Deterministic suggestions for the focused file."
              : "Deterministic suggestions from the latest dependency graph."
          }
          icon={<Sparkles className="size-5 text-muted-foreground" />}
        >
          {recommendations.length === 0 ? (
            <EmptyInsight title="No recommendations" />
          ) : (
            <div className="space-y-2">
              {recommendations.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border border-border/70 bg-background/70 p-3",
                    item.severity === "critical" &&
                      "border-destructive/50 bg-destructive/5",
                    item.severity === "warning" &&
                      "border-amber-500/40 bg-amber-500/5",
                  )}
                >
                  <p className="text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </InsightCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <InsightCard
          title="Top files by imports"
          description="Files with the highest number of outgoing internal imports."
          icon={<BarChart3 className="size-5 text-muted-foreground" />}
        >
          <FileInsightList
            projectId={project.id}
            items={topFilesByImportCount}
            focusFile={focusFile}
            metricLabel={(item) =>
              `${item.outgoingCount} outgoing • ${item.incomingCount} incoming`
            }
          />
        </InsightCard>

        <InsightCard
          title="Top files by inbound dependencies"
          description="Files most depended on by other internal source files."
          icon={<GitBranch className="size-5 text-muted-foreground" />}
        >
          <FileInsightList
            projectId={project.id}
            items={topFilesByInboundDependencyCount}
            focusFile={focusFile}
            metricLabel={(item) =>
              `${item.incomingCount} incoming • ${item.outgoingCount} outgoing`
            }
          />
        </InsightCard>

        <InsightCard
          title="Folders with most source files"
          description="Top-level folders with the highest number of parseable source files."
          icon={<FolderTree className="size-5 text-muted-foreground" />}
        >
          {topFoldersBySourceFileCount.length === 0 ? (
            <EmptyInsight title="No folders found" />
          ) : (
            <div className="space-y-2">
              {topFoldersBySourceFileCount.map((item, index) => (
                <div
                  key={`${item.folder}:${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3"
                >
                  <span className="truncate text-sm text-foreground">
                    {item.folder}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {item.sourceFileCount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </InsightCard>

        <InsightCard
          title="Orphan files"
          description="Parseable files with no incoming or outgoing internal dependencies."
          icon={<Unplug className="size-5 text-muted-foreground" />}
        >
          <FileInsightList
            projectId={project.id}
            items={orphanFiles}
            focusFile={focusFile}
            metricLabel={() => "0 incoming • 0 outgoing"}
          />
        </InsightCard>

        <InsightCard
          title="Entry-like files"
          description="High-confidence candidates for app/bootstrap/worker entry surfaces."
          icon={<Sparkles className="size-5 text-muted-foreground" />}
        >
          {entryLikeFiles.length === 0 ? (
            <EmptyInsight title="No entry-like files found" />
          ) : (
            <div className="space-y-2">
              {entryLikeFiles.map((item, index) => (
                <Link
                  key={`${item.path}:${index}`}
                  href={buildInsightsFileHref(project.id, item.path)}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3 transition-colors hover:bg-accent/40",
                    focusFile === item.path &&
                      "border-primary/60 bg-primary/5 ring-1 ring-primary/30",
                  )}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="break-all font-mono text-xs text-foreground">
                      {item.path}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Score {item.score} • {item.outgoingCount} outgoing •{" "}
                      {item.incomingCount} incoming
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.reason}
                    </p>
                  </div>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </InsightCard>

        <InsightCard
          title="Circular dependency candidates"
          description="High-confidence internal cycles, prioritizing direct two-way links and small SCCs."
          icon={<AlertCircle className="size-5 text-muted-foreground" />}
        >
          {circularDependencyCandidates.length === 0 ? (
            <EmptyInsight title="No cycle candidates found" />
          ) : (
            <div className="space-y-2">
              {circularDependencyCandidates.map((item) => (
                <div
                  key={`${item.kind}:${item.paths.join("::")}`}
                  className={cn(
                    "rounded-lg border border-border/70 bg-background/70 p-3",
                    focusFile &&
                      item.paths.includes(focusFile) &&
                      "border-primary/60 bg-primary/5 ring-1 ring-primary/30",
                  )}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-muted px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                      {item.kind}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.edgeCount} internal edges
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{item.summary}</p>
                  <ul className="mt-2 space-y-1">
                    {item.paths.map((path, index) => (
                      <li key={path + index}>
                        <Link
                          href={buildInsightsFileHref(project.id, path)}
                          className={cn(
                            "break-all font-mono text-xs text-foreground underline-offset-4 hover:underline",
                            focusFile === path && "font-semibold text-primary",
                          )}
                        >
                          {path}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </InsightCard>
      </div>
    </div>
  );
}
