"use client";

import { useState } from "react";
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

  return (
    <div className="space-y-6">
      <ProjectMapStatusBanner project={project} imports={imports} />

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
    </div>
  );
}
