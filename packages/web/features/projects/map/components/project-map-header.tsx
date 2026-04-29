"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProjectMapSearchDialog } from "../explorer/components/project-map-search-dialog";
import type { ProjectImportParseStatus } from "@/features/projects/api";

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
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/30 p-1">
        <Link
          href={`/projects/${projectId}/explorer`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            active === "mapping"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Mapping
        </Link>
        <Link
          href={`/projects/${projectId}/insights`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            active === "insights"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Insights
        </Link>
        <Link
          href={`/projects/${projectId}/graph`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            active === "graph"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Graph
        </Link>
      </div>

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
