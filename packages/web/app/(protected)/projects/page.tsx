"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GithubConnection } from "@/features/projects/github-connection";
import { RepoSelector } from "@/features/projects/repo-selector";
import { ImportProgress } from "@/features/projects/import-progress";
import { ProjectStats } from "@/features/projects/project-stats";
import { FileTreeExplorer } from "@/features/projects/file-tree-explorer";
import { DetailPanel } from "@/features/projects/detail-panel";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  language?: string;
  size?: number;
}

type ViewState = "connect" | "select" | "importing" | "analyzing";

export default function ProjectsPage() {
  const [viewState, setViewState] = useState<ViewState>("importing");
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);

  const handleConnect = () => {
    setViewState("select");
  };

  const handleSelectRepo = () => {
    setViewState("importing");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Import and analyze your code repositories
          </p>
        </div>
      </div>

      {/* Main Content */}
      {viewState === "connect" && <GithubConnection />}

      {viewState === "select" && (
        <div className="space-y-6">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewState("connect")}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          <RepoSelector />
        </div>
      )}

      {(viewState === "importing" || viewState === "analyzing") && (
        <div className="space-y-6">
          {/* Import Progress */}
          <ImportProgress />

          {/* Stats */}
          <ProjectStats />

          {/* Code Explorer */}
          <div className="rounded-lg border border-sidebar-border bg-card overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 h-[600px]">
              {/* File Tree */}
              <div className="lg:col-span-1 border-r border-sidebar-border overflow-hidden bg-sidebar">
                <FileTreeExplorer
                  onSelectFile={setSelectedFile}
                  selectedFileId={selectedFile?.id}
                />
              </div>

              {/* Details Panel */}
              <div className="lg:col-span-3 overflow-hidden">
                {selectedFile ? (
                  <DetailPanel file={selectedFile} />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-muted-foreground">
                        Select a file to view details
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Related Tabs */}
          <div className="rounded-lg border border-sidebar-border bg-card p-6">
            <Tabs defaultValue="recent" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-sidebar-accent">
                <TabsTrigger value="recent">Recent Files</TabsTrigger>
                <TabsTrigger value="complex">Complex Files</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
              </TabsList>

              <TabsContent value="recent" className="mt-6 space-y-3">
                {[
                  { name: "Button.tsx", time: "2 hours ago" },
                  { name: "useAuth.ts", time: "4 hours ago" },
                  { name: "Modal.tsx", time: "Yesterday" },
                ].map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-sidebar-accent"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {file.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {file.time}
                    </span>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="complex" className="mt-6 space-y-3">
                {[
                  { name: "Modal.tsx", score: "92%" },
                  { name: "helpers.ts", score: "87%" },
                  { name: "useAuth.ts", score: "78%" },
                ].map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-sidebar-accent"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {file.name}
                    </span>
                    <span className="text-xs font-bold text-destructive">
                      {file.score}
                    </span>
                  </div>
                ))}
              </TabsContent>

              <TabsContent
                value="metrics"
                className="mt-6 grid grid-cols-3 gap-4"
              >
                {[
                  { label: "Avg Complexity", value: "6.2" },
                  { label: "Maintainability", value: "78%" },
                  { label: "Test Coverage", value: "64%" },
                ].map((metric, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg bg-sidebar-accent text-center"
                  >
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      {metric.label}
                    </p>
                    <p className="text-2xl font-bold text-foreground mt-2">
                      {metric.value}
                    </p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
