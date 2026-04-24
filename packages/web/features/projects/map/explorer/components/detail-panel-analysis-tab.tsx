"use client";

import {
  BarChart3,
  Boxes,
  FolderTree,
  Languages,
  ScanSearch,
} from "lucide-react";
import { ClickableCard, ClickHintIcon, EmptyTabState, renderBar } from "./detail-panel-shared";
import type { ProjectAnalysisSummary } from "@/features/projects/api";

interface DetailPanelAnalysisTabProps {
  analysisSummary?: ProjectAnalysisSummary;
  analysisLoading?: boolean;
  onNavigateToFile: (
    path: string,
    tab?: string,
    range?: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    },
  ) => void;
}

export function DetailPanelAnalysisTab({
  analysisSummary,
  analysisLoading = false,
  onNavigateToFile,
}: DetailPanelAnalysisTabProps) {
  const maxFolderCount = Math.max(
    ...(analysisSummary?.topFolders.map((item) => item.sourceFileCount) ?? [0]),
  );
  const maxLanguageCount = Math.max(
    ...(analysisSummary?.sourceFileDistribution.map((item) => item.fileCount) ?? [
      0,
    ]),
  );

  if (analysisLoading) {
    return (
      <EmptyTabState
        title="Loading analysis"
        description="Project-level semantic analysis is still being fetched."
      />
    );
  }

  if (!analysisSummary) {
    return (
      <EmptyTabState
        title="Analysis is unavailable"
        description="Project-level semantic analysis has not been loaded yet."
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border/70 bg-background/70 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ScanSearch className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Totals
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Files</p>
              <p className="text-lg font-semibold">
                {analysisSummary.totals.files}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Source files</p>
              <p className="text-lg font-semibold">
                {analysisSummary.totals.sourceFiles}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Parsed files</p>
              <p className="text-lg font-semibold">
                {analysisSummary.totals.parsedFiles}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Dependencies</p>
              <p className="text-lg font-semibold">
                {analysisSummary.totals.dependencies}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/70 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Boxes className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Symbols
            </p>
          </div>
          <p className="text-3xl font-semibold text-foreground">
            {analysisSummary.totals.symbols}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Semantic symbols extracted for the current map import.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top files by dependencies
          </p>
        </div>
        {analysisSummary.topFilesByDependencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No dependency edges have been indexed yet.
          </p>
        ) : (
          <div className="space-y-3">
            {analysisSummary.topFilesByDependencies.map((item) => (
              <ClickableCard
                key={item.path}
                onClick={() => onNavigateToFile(item.path, "details")}
                className="space-y-1"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-mono text-xs text-foreground">
                    {item.path}
                  </p>
                  <ClickHintIcon />
                </div>
                <p className="text-xs text-muted-foreground">
                  Outgoing {item.outgoingCount} • Incoming {item.incomingCount}
                </p>
              </ClickableCard>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/70 bg-background/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <FolderTree className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top folders
          </p>
        </div>
        {analysisSummary.topFolders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Folder distribution is not available yet.
          </p>
        ) : (
          <div className="space-y-3">
            {analysisSummary.topFolders.map((item) => (
              <div key={item.folder} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-foreground">{item.folder}</span>
                  <span className="text-muted-foreground">
                    {item.sourceFileCount}
                  </span>
                </div>
                {renderBar(item.sourceFileCount, maxFolderCount)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/70 bg-background/70 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Languages className="size-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Source file distribution
          </p>
        </div>
        {analysisSummary.sourceFileDistribution.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Language distribution is not available yet.
          </p>
        ) : (
          <div className="space-y-3">
            {analysisSummary.sourceFileDistribution.map((item) => (
              <div key={item.language} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-foreground">
                    {item.language}
                  </span>
                  <span className="text-muted-foreground">{item.fileCount}</span>
                </div>
                {renderBar(item.fileCount, maxLanguageCount)}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
