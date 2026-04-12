"use client";

import { useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Project, ProjectImport } from "@/lib/api/projects";
import { DetailPanel } from "./detail-panel";
import { FileTreeExplorer, type FileNode } from "./file-tree-explorer";
import { ProjectMapStatusBanner } from "./project-map-status-banner";

type MapView = "structure" | "dependencies" | "entry-points";

const initialSelectedFile: FileNode = {
  id: "src",
  name: "src",
  type: "folder",
  language: "TypeScript",
};

export function ProjectMapShell({
  project,
  imports,
}: {
  project: Project;
  imports: ProjectImport[];
}) {
  const [activeView, setActiveView] = useState<MapView>("structure");
  const [selectedFile, setSelectedFile] = useState<FileNode>(initialSelectedFile);
  const latestImport = imports[0] ?? null;
  const hasCompletedImport = imports.some((item) => item.status === "completed");
  const isImportProcessing =
    project.status === "importing" ||
    latestImport?.status === "pending" ||
    latestImport?.status === "running";

  return (
    <div className="space-y-6">
      <ProjectMapStatusBanner project={project} imports={imports} />

      {hasCompletedImport ? (
        <div className="rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/70 px-4 py-4">
            <Tabs
              value={activeView}
              onValueChange={(value: string) => setActiveView(value as MapView)}
              className="w-full"
            >
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="structure">Structure</TabsTrigger>
                <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
                <TabsTrigger value="entry-points">Entry Points</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid h-[680px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="border-r border-border/70 bg-sidebar">
              <FileTreeExplorer
                onSelectFile={setSelectedFile}
                selectedFileId={selectedFile.id}
              />
            </div>
            <div className="min-w-0">
              <DetailPanel file={selectedFile} activeView={activeView} />
            </div>
          </div>
        </div>
      ) : (
        <Empty className="min-h-[420px] rounded-lg border border-dashed border-border bg-card p-10">
          <EmptyHeader>
            <EmptyTitle>
              {isImportProcessing
                ? "Project map is being prepared"
                : "No code map available yet"}
            </EmptyTitle>
            <EmptyDescription>
              {isImportProcessing
                ? "The first import has started. Once an import completes, this page will unlock the structure explorer."
                : "Run an import from the project overview to generate the first project map."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
