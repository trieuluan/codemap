"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ProjectAnalysisSummary,
  ProjectFileContent,
  ProjectFileExport,
  ProjectFileIncomingImportEdge,
  ProjectFileImportEdge,
  ProjectFileParseData,
  ProjectFileSymbol,
} from "@/features/projects/api";
import type { RepositoryTreeNode } from "../utils/file-tree-model";
import { DetailPanelAnalysisTab } from "./detail-panel-analysis-tab";
import { DetailPanelDetailsTab } from "./detail-panel-details-tab";
import { DetailPanelRelationshipsTab } from "./detail-panel-relationships-tab";

export interface DetailPanelProps {
  projectId: string;
  file: RepositoryTreeNode;
  fileContent?: ProjectFileContent;
  parseData?: ProjectFileParseData;
  analysisSummary?: ProjectAnalysisSummary;
  parseDataLoading?: boolean;
  analysisLoading?: boolean;
  activeTab: string;
  onActiveTabChange: (value: string) => void;
  openRelationshipSections: string[];
  onOpenRelationshipSectionsChange: (value: string[]) => void;
  onNavigateToSymbol: (symbol: ProjectFileSymbol) => void;
  onNavigateToImport: (item: ProjectFileImportEdge) => void;
  onNavigateToIncomingImport: (item: ProjectFileIncomingImportEdge) => void;
  onNavigateToExport: (item: ProjectFileExport) => void;
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

export function DetailPanel({
  projectId,
  file,
  fileContent,
  parseData,
  analysisSummary,
  parseDataLoading = false,
  analysisLoading = false,
  activeTab,
  onActiveTabChange,
  openRelationshipSections,
  onOpenRelationshipSectionsChange,
  onNavigateToSymbol,
  onNavigateToImport,
  onNavigateToIncomingImport,
  onNavigateToExport,
  onNavigateToFile,
}: DetailPanelProps) {
  const relationshipTabValue =
    activeTab === "analysis" ? "analysis" : activeTab === "details" ? "details" : "relationships";

  return (
    <div className="flex h-full flex-col">
      <Tabs
        value={relationshipTabValue}
        onValueChange={onActiveTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border/70 px-4 py-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="relationships">Relationships</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="details" className="mt-0 space-y-4">
            <DetailPanelDetailsTab
              projectId={projectId}
              file={file}
              fileContent={fileContent}
              parseData={parseData}
              analysisSummary={analysisSummary}
              parseDataLoading={parseDataLoading}
              onNavigateToFile={onNavigateToFile}
            />
          </TabsContent>

          <TabsContent value="relationships" className="mt-0">
            <DetailPanelRelationshipsTab
              file={file}
              parseData={parseData}
              parseDataLoading={parseDataLoading}
              openRelationshipSections={openRelationshipSections}
              onOpenRelationshipSectionsChange={onOpenRelationshipSectionsChange}
              onNavigateToSymbol={onNavigateToSymbol}
              onNavigateToImport={onNavigateToImport}
              onNavigateToIncomingImport={onNavigateToIncomingImport}
              onNavigateToExport={onNavigateToExport}
            />
          </TabsContent>

          <TabsContent value="analysis" className="mt-0 space-y-4">
            <DetailPanelAnalysisTab
              analysisSummary={analysisSummary}
              analysisLoading={analysisLoading}
              onNavigateToFile={onNavigateToFile}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
