"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  BarChart2,
  CornerDownRight,
  FileCode2,
  History,
  Loader2,
  Network,
  Workflow,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { browserProjectsApi } from "@/features/projects/api";
import type {
  ProjectImportParseStatus,
  ProjectMapSearchResponse,
} from "@/features/projects/api";
import { cn } from "@/lib/utils";

interface ProjectMapSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  importId?: string | null;
  parseStatus?: ProjectImportParseStatus | null;
}

type NavigatorFilter = "all" | "explorer" | "graph" | "insights";
type NavigatorDestination = Exclude<NavigatorFilter, "all">;

interface NavigatorTarget {
  key: string;
  type: "file" | "symbol" | "export";
  title: string;
  path: string;
  subtitle: string;
  symbolName?: string;
}

const FILTERS: Array<{ key: NavigatorFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "explorer", label: "Explorer" },
  { key: "graph", label: "Graph" },
  { key: "insights", label: "Insights" },
];

const DESTINATIONS: Array<{
  key: NavigatorDestination;
  label: string;
  action: string;
  icon: typeof Workflow;
}> = [
  {
    key: "explorer",
    label: "Explorer",
    action: "Open in Explorer",
    icon: Workflow,
  },
  { key: "graph", label: "Graph", action: "Focus in Graph", icon: Network },
  {
    key: "insights",
    label: "Insights",
    action: "View in Insights",
    icon: BarChart2,
  },
];

export function ProjectMapSearchDialog({
  open,
  onOpenChange,
  projectId,
  importId,
  parseStatus,
}: ProjectMapSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<NavigatorFilter>("all");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const { data: searchResults, isLoading } = useSWR<ProjectMapSearchResponse>(
    importId && debouncedQuery.length >= 2
      ? ["project-map-search", projectId, importId, debouncedQuery]
      : null,
    ([, currentProjectId, , searchQuery]: [string, string, string, string]) =>
      browserProjectsApi.searchProjectMap(
        currentProjectId as string,
        searchQuery as string,
      ),
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      keepPreviousData: true,
    },
  );

  const hasResults = useMemo(
    () =>
      Boolean(
        searchResults?.files.length ||
          searchResults?.symbols.length ||
          searchResults?.exports.length,
      ),
    [searchResults],
  );

  const closeDialog = () => {
    onOpenChange(false);
  };

  const navigateTo = (href: string) => {
    closeDialog();
    router.push(href);
  };

  const destinationHref = (
    destination: NavigatorDestination,
    item: NavigatorTarget,
  ) => {
    const filePath = item.path;
    const encodedPath = encodeURIComponent(filePath);

    if (destination === "graph") {
      return `/projects/${projectId}/graph?file=${encodedPath}`;
    }

    if (destination === "insights") {
      const symbolQuery = item.symbolName
        ? `&symbol=${encodeURIComponent(item.symbolName)}`
        : "";

      return `/projects/${projectId}/insights?file=${encodedPath}${symbolQuery}`;
    }

    return `/projects/${projectId}/explorer?path=${encodedPath}`;
  };

  const targets = useMemo<NavigatorTarget[]>(() => {
    if (!searchResults) {
      return [];
    }

    return [
      ...searchResults.files.map((item) => ({
        key: `file:${item.path}`,
        type: "file" as const,
        title: item.path,
        path: item.path,
        subtitle: item.language ?? "Unknown language",
      })),
      ...searchResults.symbols.map((item) => ({
        key: `symbol:${item.id}`,
        type: "symbol" as const,
        title: item.displayName,
        path: item.filePath,
        subtitle: `${item.symbolKind.replace(/_/g, " ")} • ${item.filePath}`,
        symbolName: item.displayName,
      })),
      ...searchResults.exports.map((item) => ({
        key: `export:${item.id}`,
        type: "export" as const,
        title: item.exportName,
        path: item.filePath,
        subtitle: item.filePath,
        symbolName: item.exportName,
      })),
    ];
  }, [searchResults]);

  const visibleDestinations = useMemo(
    () =>
      filter === "all"
        ? DESTINATIONS
        : DESTINATIONS.filter((destination) => destination.key === filter),
    [filter],
  );

  const quickActions = useMemo(
    () =>
      [
        {
          key: "explorer",
          label: "Open Explorer",
          description: "Browse files and inspect source.",
          icon: Workflow,
          href: `/projects/${projectId}/explorer`,
          destination: "explorer" as const,
        },
        {
          key: "graph",
          label: "Open Graph",
          description: "Explore file and folder dependencies.",
          icon: Network,
          href: `/projects/${projectId}/graph`,
          destination: "graph" as const,
        },
        {
          key: "insights",
          label: "Open Insights",
          description: "Review dependency and structure signals.",
          icon: BarChart2,
          href: `/projects/${projectId}/insights`,
          destination: "insights" as const,
        },
        {
          key: "history",
          label: "Open History",
          description: "Compare imports and parser changes.",
          icon: History,
          href: `/projects/${projectId}/history`,
          destination: "all" as const,
        },
      ].filter((item) => filter === "all" || item.destination === filter),
    [filter, projectId],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Project navigator"
      description="Search once, then open the result in Explorer, Graph, or Insights."
      className="max-w-2xl"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Type a file path, symbol, or export name"
      />
      <div className="flex gap-1 border-b border-border/70 p-2">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              filter === item.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <CommandList className="max-h-[440px]">
        {query.trim().length < 2 ? (
          quickActions.length ? (
            <CommandGroup heading="Quick actions">
              {quickActions.map((item) => {
                const Icon = item.icon;

                return (
                  <CommandItem
                    key={item.key}
                    value={`${item.label} ${item.description}`}
                    onSelect={() => navigateTo(item.href)}
                  >
                    <Icon className="mt-0.5 size-4" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : (
            <CommandEmpty>No quick actions for this filter.</CommandEmpty>
          )
        ) : parseStatus !== "completed" && parseStatus !== "partial" ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Semantic index is being built
            </p>
            <p className="text-xs text-muted-foreground">
              Search will be available once the parse phase completes. This usually takes a few seconds.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching project map…
          </div>
        ) : !hasResults ? (
          <CommandEmpty>No matching files, symbols, or exports.</CommandEmpty>
        ) : (
          <>
            {visibleDestinations.map((destination, index) => {
              const DestinationIcon = destination.icon;

              return (
                <div key={destination.key}>
                  {index > 0 ? <CommandSeparator /> : null}
                  <CommandGroup heading={destination.label}>
                    {targets.map((item) => (
                      <CommandItem
                        key={`${destination.key}:${item.key}`}
                        value={`${destination.action} ${item.type} ${item.title} ${item.path} ${item.subtitle}`}
                        onSelect={() =>
                          navigateTo(destinationHref(destination.key, item))
                        }
                      >
                        {item.type === "file" ? (
                          <FileCode2 className="mt-0.5 size-4" />
                        ) : (
                          <CornerDownRight className="mt-0.5 size-4" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">
                              {item.title}
                            </p>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {item.type}
                            </span>
                          </div>
                          <p className="break-all text-xs text-muted-foreground">
                            {item.subtitle}
                          </p>
                        </div>
                        <div className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                          <DestinationIcon className="size-3.5" />
                          {destination.action}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </div>
              );
            })}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
