"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart2, Network, Search, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProjectMapSearchDialog } from "../explorer/components/project-map-search-dialog";
import type { ProjectImportParseStatus } from "@/features/projects/api";

const NAV_ITEMS = [
  { key: "mapping", href: (id: string) => `/projects/${id}/explorer`, icon: Workflow, label: "Explorer" },
  { key: "insights", href: (id: string) => `/projects/${id}/insights`, icon: BarChart2, label: "Insights" },
  { key: "graph", href: (id: string) => `/projects/${id}/graph`, icon: Network, label: "Graph" },
] as const;

export function ProjectMapHeader({
  projectId,
  active,
  importId,
  parseStatus,
}: {
  projectId: string;
  active: "mapping" | "insights" | "graph";
  importId?: string | null;
  parseStatus?: ProjectImportParseStatus | null;
}) {
  const router = useRouter();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigateToFile = (filePath: string) => {
    router.push(
      `/projects/${projectId}/explorer?path=${encodeURIComponent(filePath)}`,
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TooltipProvider delayDuration={300}>
        <div className="inline-flex items-center rounded-md border border-border/70 bg-muted/30 p-0.5">
          {NAV_ITEMS.map(({ key, href, icon: Icon, label }) => {
            const isActive = active === key;
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Link
                    href={href(projectId)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded transition-colors",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    aria-label={label}
                  >
                    <Icon className="size-3.5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsSearchOpen(true)}
      >
        <Search className="size-4 text-muted-foreground" />
        Search project
        <span className="ml-1 text-xs text-muted-foreground">⌘K / Ctrl+K</span>
      </Button>

      <ProjectMapSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        projectId={projectId}
        importId={importId}
        parseStatus={parseStatus}
        onSelectFile={(item) => navigateToFile(item.path)}
        onSelectSymbol={(item) => navigateToFile(item.filePath)}
        onSelectExport={(item) => navigateToFile(item.filePath)}
      />
    </div>
  );
}
