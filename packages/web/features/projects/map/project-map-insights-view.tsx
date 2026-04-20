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
import type {
  Project,
  ProjectImport,
  ProjectMapInsightsResponse,
} from "@/lib/api/projects";
import { ProjectMapStatusBanner } from "./project-map-status-banner";

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

function EmptyInsight({
  title,
}: {
  title: string;
}) {
  return (
    <Empty className="min-h-[120px] rounded-lg border border-dashed border-border bg-background/40 p-6">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>No results to show yet.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function FileInsightList({
  projectId,
  items,
  metricLabel,
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
}) {
  if (items.length === 0) {
    return <EmptyInsight title="No files found" />;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link
          key={item.path}
          href={`/projects/${projectId}/map?path=${encodeURIComponent(item.path)}`}
          className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3 transition-colors hover:bg-accent/40"
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

export function ProjectMapInsightsView({
  project,
  imports,
  insights,
}: {
  project: Project;
  imports: ProjectImport[];
  insights: ProjectMapInsightsResponse;
}) {
  return (
    <div className="space-y-6">
      <ProjectMapStatusBanner
        project={project}
        imports={imports}
        mapSnapshot={null}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Files", value: insights.totals.files },
          { label: "Source files", value: insights.totals.sourceFiles },
          { label: "Parsed files", value: insights.totals.parsedFiles },
          { label: "Dependencies", value: insights.totals.dependencies },
          { label: "Symbols", value: insights.totals.symbols },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border/70 bg-card p-4"
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <InsightCard
          title="Top files by imports"
          description="Files with the highest number of outgoing internal imports."
          icon={<BarChart3 className="size-5 text-muted-foreground" />}
        >
          <FileInsightList
            projectId={project.id}
            items={insights.topFilesByImportCount}
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
            items={insights.topFilesByInboundDependencyCount}
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
          {insights.topFoldersBySourceFileCount.length === 0 ? (
            <EmptyInsight title="No folders found" />
          ) : (
            <div className="space-y-2">
              {insights.topFoldersBySourceFileCount.map((item) => (
                <div
                  key={item.folder}
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
            items={insights.orphanFiles}
            metricLabel={() => "0 incoming • 0 outgoing"}
          />
        </InsightCard>

        <InsightCard
          title="Entry-like files"
          description="High-confidence candidates for app/bootstrap/worker entry surfaces."
          icon={<Sparkles className="size-5 text-muted-foreground" />}
        >
          {insights.entryLikeFiles.length === 0 ? (
            <EmptyInsight title="No entry-like files found" />
          ) : (
            <div className="space-y-2">
              {insights.entryLikeFiles.map((item) => (
                <Link
                  key={item.path}
                  href={`/projects/${project.id}/map?path=${encodeURIComponent(item.path)}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3 transition-colors hover:bg-accent/40"
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
          {insights.circularDependencyCandidates.length === 0 ? (
            <EmptyInsight title="No cycle candidates found" />
          ) : (
            <div className="space-y-2">
              {insights.circularDependencyCandidates.map((item) => (
                <div
                  key={`${item.kind}:${item.paths.join("::")}`}
                  className="rounded-lg border border-border/70 bg-background/70 p-3"
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
                    {item.paths.map((path) => (
                      <li key={path}>
                        <Link
                          href={`/projects/${project.id}/map?path=${encodeURIComponent(path)}`}
                          className="break-all font-mono text-xs text-foreground underline-offset-4 hover:underline"
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
