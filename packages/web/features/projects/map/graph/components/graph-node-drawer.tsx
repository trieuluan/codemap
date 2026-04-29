"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { browserProjectsApi } from "@/features/projects/api";
import type {
  ProjectFileContent,
  ProjectFileParseData,
  ProjectMapGraphCycle,
  ProjectMapGraphEdge,
  ProjectMapGraphNode,
} from "@/features/projects/api";
import { getFileName } from "./graph-node-drawer-utils";
import { InfoTab, CodeTab, DepsTab, CyclesTab } from "./graph-node-drawer-tabs";

interface GraphNodeDrawerProps {
  projectId: string;
  node: ProjectMapGraphNode | null;
  isInCycle: boolean;
  cycles: ProjectMapGraphCycle[];
  graphNodes: ProjectMapGraphNode[];
  graphEdges: ProjectMapGraphEdge[];
  onClose: () => void;
  onSelectByPath: (path: string) => void;
}

export function GraphNodeDrawer({
  projectId,
  node,
  isInCycle,
  cycles,
  graphNodes,
  graphEdges,
  onClose,
  onSelectByPath,
}: GraphNodeDrawerProps) {
  const { data: fileContent, isLoading: contentLoading } =
    useSWR<ProjectFileContent>(
      node ? ["graph-drawer-content", projectId, node.path] : null,
      ([, pid, path]: [string, string, string]) =>
        browserProjectsApi.getProjectFileContent(pid, path),
      { revalidateOnFocus: false, revalidateIfStale: false },
    );

  const { data: parseData, isLoading: parseLoading } =
    useSWR<ProjectFileParseData>(
      node ? ["graph-drawer-parse", projectId, node.path] : null,
      ([, pid, path]: [string, string, string]) =>
        browserProjectsApi.getProjectFileParseData(pid, path),
      { revalidateOnFocus: false, revalidateIfStale: false },
    );

  return (
    <Sheet open={!!node} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex h-full min-h-0 w-[480px] max-w-[100vw] flex-col gap-0 overflow-hidden p-0 sm:w-[540px] sm:max-w-[540px]"
      >
        {node && (
          <>
            <SheetHeader className="shrink-0 border-b px-5 py-4">
              <SheetTitle className="sr-only">{getFileName(node.path)}</SheetTitle>
              <div className="flex items-start justify-between gap-8">
                <div className="min-w-0 pr-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {getFileName(node.path)}
                    </p>
                    {node.language && (
                      <Badge variant="secondary" className="text-xs">
                        {node.language}
                      </Badge>
                    )}
                    {isInCycle && (
                      <Badge
                        variant="outline"
                        className="border-destructive/40 bg-destructive/10 text-destructive text-xs"
                      >
                        Cycle
                      </Badge>
                    )}
                  </div>
                  {node.dirPath && (
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/60">
                      {node.dirPath}
                    </p>
                  )}
                </div>
              </div>
            </SheetHeader>

            <Tabs
              defaultValue="info"
              className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden"
            >
              <TabsList className="mx-5 mt-3 shrink-0 justify-start">
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="code">Code</TabsTrigger>
                <TabsTrigger value="deps">Dependencies</TabsTrigger>
                {isInCycle ? (
                  <TabsTrigger value="cycles">Cycles</TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent
                value="info"
                className="mt-0 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                <InfoTab
                  node={node}
                  fileContent={fileContent}
                  isLoading={contentLoading}
                />
              </TabsContent>

              <TabsContent
                value="code"
                className="mt-0 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                <CodeTab
                  node={node}
                  fileContent={fileContent}
                  isLoading={contentLoading}
                />
              </TabsContent>

              <TabsContent
                value="deps"
                className="mt-0 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                <DepsTab
                  parseData={parseData}
                  isLoading={parseLoading}
                  projectId={projectId}
                  onSelectNode={onSelectByPath}
                />
              </TabsContent>

              {isInCycle ? (
                <TabsContent
                  value="cycles"
                  className="mt-0 flex min-h-0 flex-1 basis-0 flex-col overflow-hidden data-[state=inactive]:hidden"
                >
                  <CyclesTab
                    cycles={cycles}
                    currentPath={node.path}
                    nodes={graphNodes}
                    edges={graphEdges}
                    onSelectNode={onSelectByPath}
                  />
                </TabsContent>
              ) : null}
            </Tabs>

            <div className="shrink-0 border-t px-5 py-3">
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/projects/${projectId}/explorer?path=${encodeURIComponent(node.path)}`}
                >
                  Open in Mapping
                  <ArrowRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
