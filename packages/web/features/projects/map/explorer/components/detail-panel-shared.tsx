"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ProjectFileExport,
  ProjectFileImportEdge,
} from "@/features/projects/api";
import { cn } from "@/lib/utils";
import type { RepositoryTreeNode } from "../utils/file-tree-model";

export function getDisplayExtension(file: RepositoryTreeNode) {
  if (file.type === "folder") {
    return "DIRECTORY";
  }

  return (
    file.extension?.toUpperCase() ||
    file.name.split(".").pop()?.toUpperCase() ||
    "FILE"
  );
}

export function formatFileSize(sizeBytes?: number | null) {
  if (sizeBytes == null) {
    return "—";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatParseStatusLabel(value?: string | null) {
  if (!value) {
    return "—";
  }

  return value.replace(/_/g, " ");
}

export function getLineCountFallback(
  lineCount?: number | null,
  content?: string | null,
) {
  if (lineCount != null) {
    return String(lineCount);
  }

  if (typeof content === "string") {
    return String(content.split(/\r?\n/).length);
  }

  return "—";
}

export function getMimeTypeFallback(
  mimeType?: string | null,
  extension?: string | null,
) {
  if (mimeType) {
    return mimeType;
  }

  switch (extension?.toLowerCase()) {
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown";
    case ".toml":
      return "application/toml";
    case ".ico":
      return "image/x-icon";
    case ".env":
    case ".txt":
    case ".conf":
    case ".ini":
    case ".lock":
      return "text/plain";
    case ".xml":
      return "application/xml";
    case ".svg":
      return "image/svg+xml";
    default:
      return "—";
  }
}

export function getResolutionKindLabel(value: string) {
  switch (value) {
    case "relative_path":
      return "Internal";
    case "tsconfig_alias":
      return "Alias";
    case "package":
      return "Package";
    case "builtin":
      return "Builtin";
    case "unresolved":
      return "Unresolved";
    default:
      return value.replace(/_/g, " ");
  }
}

export function getTitleBadgeClassName(kind: string) {
  switch (kind) {
    case "import":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300";
    case "export from":
      return "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300";
    case "dynamic import":
      return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300";
    case "require":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "component":
      return "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-300";
    case "function":
      return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300";
    case "class":
      return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300";
    case "interface":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300";
    case "type alias":
    case "type_alias":
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
    case "enum":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "variable":
    case "constant":
      return "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";
    default:
      return "";
  }
}

export function getResolutionKindBadgeClassName(value: string) {
  switch (value) {
    case "relative_path":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "tsconfig_alias":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "package":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "builtin":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "unresolved":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-foreground";
  }
}

export function renderBar(value: number, maxValue: number) {
  const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 8) : 0;

  return (
    <div className="h-2 rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary/70"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function formatPlural(
  count: number,
  singular: string,
  plural = `${singular}s`,
) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function isInternalImport(item: ProjectFileImportEdge) {
  return (
    (item.resolutionKind === "relative_path" ||
      item.resolutionKind === "tsconfig_alias") &&
    Boolean(item.targetPathText)
  );
}

export function hasLinkedExportDeclaration(item: ProjectFileExport) {
  return Boolean(
    item.symbolId &&
      item.symbolStartLine &&
      item.symbolStartCol &&
      item.symbolEndLine &&
      item.symbolEndCol,
  );
}

export function ClickHintIcon() {
  return <ArrowUpRight className="size-3.5 text-muted-foreground" />;
}

export function getNpmPackageName(moduleSpecifier: string) {
  if (!moduleSpecifier) {
    return null;
  }

  if (moduleSpecifier.startsWith("@")) {
    const [scope, name] = moduleSpecifier.split("/");

    if (!scope || !name) {
      return moduleSpecifier;
    }

    return `${scope}/${name}`;
  }

  const [name] = moduleSpecifier.split("/");
  return name || null;
}

export interface RelationshipListItem {
  id: string;
  title: string;
  titleBadge: string;
  resolutionLabel?: string;
  resolutionClassName?: string;
  targetLabel?: string;
  targetValue?: string | null;
  location: string;
  detailLabel?: string;
  detailValue?: string | null;
  canNavigate?: boolean;
  onNavigate?: () => void;
  actionIcon?: ReactNode;
  actionHref?: string | null;
  actionLabel?: string;
}

export function ClickableCard({
  children,
  onClick,
  disabled = false,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  if (disabled || !onClick) {
    return (
      <div
        className={cn(
          "rounded-lg border border-border/70 bg-background/70 p-3 transition-colors hover:bg-accent/20",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-border/70 bg-background/70 p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function RelationshipList({ items }: { items: RelationshipListItem[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ClickableCard
          key={item.id}
          onClick={item.canNavigate ? item.onNavigate : undefined}
          disabled={!item.canNavigate}
        >
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <p className="break-all font-medium text-foreground">{item.title}</p>
            <Badge
              variant="outline"
              className={cn(
                "capitalize border font-medium shadow-sm",
                getTitleBadgeClassName(item.titleBadge) ||
                  "border-border bg-muted text-foreground",
              )}
            >
              {item.titleBadge}
            </Badge>
            {item.resolutionLabel ? (
              <Badge
                variant="outline"
                className={cn(
                  "border font-semibold shadow-sm",
                  item.resolutionClassName,
                )}
              >
                {item.resolutionLabel}
              </Badge>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {item.actionHref ? (
                <a
                  href={item.actionHref}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  aria-label={item.actionLabel}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.actionIcon}
                </a>
              ) : item.actionIcon ? (
                <span
                  aria-hidden="true"
                  className="inline-flex size-7 items-center justify-center text-muted-foreground"
                >
                  {item.actionIcon}
                </span>
              ) : null}
              {item.canNavigate ? <ClickHintIcon /> : null}
            </div>
          </div>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            {item.targetLabel && item.targetValue ? (
              <p>
                {item.targetLabel}: {item.targetValue}
              </p>
            ) : null}
            {item.detailLabel && item.detailValue ? (
              <p>
                {item.detailLabel}: {item.detailValue}
              </p>
            ) : null}
            <p>Location: {item.location}</p>
          </div>
        </ClickableCard>
      ))}
    </div>
  );
}

export function EmptyTabState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="rounded-lg border border-dashed border-border bg-background/40 p-8">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function RelationshipLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-border/70 bg-background/70 p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
