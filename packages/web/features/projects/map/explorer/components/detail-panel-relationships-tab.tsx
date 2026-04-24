"use client";

import { ArrowRight, Binary, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type {
  ProjectFileExport,
  ProjectFileIncomingImportEdge,
  ProjectFileImportEdge,
  ProjectFileParseData,
  ProjectFileSymbol,
} from "@/features/projects/api";
import { cn } from "@/lib/utils";
import type { RepositoryTreeNode } from "../utils/file-tree-model";
import {
  ClickableCard,
  ClickHintIcon,
  EmptyTabState,
  getNpmPackageName,
  getResolutionKindBadgeClassName,
  getResolutionKindLabel,
  getTitleBadgeClassName,
  hasLinkedExportDeclaration,
  isInternalImport,
  RelationshipList,
  RelationshipLoadingSkeleton,
} from "./detail-panel-shared";

interface DetailPanelRelationshipsTabProps {
  file: RepositoryTreeNode;
  parseData?: ProjectFileParseData;
  parseDataLoading?: boolean;
  openRelationshipSections: string[];
  onOpenRelationshipSectionsChange: (value: string[]) => void;
  onNavigateToSymbol: (symbol: ProjectFileSymbol) => void;
  onNavigateToImport: (item: ProjectFileImportEdge) => void;
  onNavigateToIncomingImport: (item: ProjectFileIncomingImportEdge) => void;
  onNavigateToExport: (item: ProjectFileExport) => void;
}

export function DetailPanelRelationshipsTab({
  file,
  parseData,
  parseDataLoading = false,
  openRelationshipSections,
  onOpenRelationshipSectionsChange,
  onNavigateToSymbol,
  onNavigateToImport,
  onNavigateToIncomingImport,
  onNavigateToExport,
}: DetailPanelRelationshipsTabProps) {
  return (
    <Accordion
      type="multiple"
      value={openRelationshipSections}
      onValueChange={onOpenRelationshipSectionsChange}
      className="space-y-3"
    >
      <AccordionItem
        value="imports"
        className="rounded-lg border border-border/70 bg-background/70 px-4"
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-medium text-foreground">Imports</span>
            <Badge variant="secondary">{parseData?.imports.length ?? 0}</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {file.type !== "file" ? (
            <EmptyTabState
              title="Imports are file-specific"
              description="Select a file to inspect its resolved and unresolved imports."
            />
          ) : parseDataLoading ? (
            <RelationshipLoadingSkeleton />
          ) : !parseData ? (
            <EmptyTabState
              title="No parse data yet"
              description="Semantic analysis has not produced import information for this file yet."
            />
          ) : parseData.imports.length === 0 ? (
            <EmptyTabState
              title="No imports found"
              description="This file does not currently declare import edges in the semantic index."
            />
          ) : (
            <RelationshipList
              items={parseData.imports.map((item) => ({
                id: item.id,
                title: item.moduleSpecifier,
                titleBadge: item.importKind.replace(/_/g, " "),
                resolutionLabel: getResolutionKindLabel(item.resolutionKind),
                resolutionClassName: getResolutionKindBadgeClassName(
                  item.resolutionKind,
                ),
                targetLabel: "Target",
                targetValue:
                  item.targetPathText ??
                  item.targetExternalSymbolKey ??
                  "Unknown target",
                detailLabel: "Resolution",
                detailValue: getResolutionKindLabel(item.resolutionKind),
                location: `L${item.startLine}:${item.startCol}`,
                canNavigate: isInternalImport(item),
                onNavigate: () => onNavigateToImport(item),
                actionIcon: isInternalImport(item) ? (
                  <ArrowRight className="size-4" />
                ) : item.resolutionKind === "package" ? (
                  <ExternalLink className="size-4" />
                ) : undefined,
                actionHref:
                  item.resolutionKind === "package" &&
                  getNpmPackageName(item.moduleSpecifier)
                    ? `https://www.npmjs.com/package/${getNpmPackageName(item.moduleSpecifier)}`
                    : null,
                actionLabel:
                  item.resolutionKind === "package"
                    ? "Open package on npm"
                    : undefined,
              }))}
            />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="imported-by"
        className="rounded-lg border border-border/70 bg-background/70 px-4"
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-medium text-foreground">Imported by</span>
            <Badge variant="secondary">
              {parseData?.importedBy.length ?? 0}
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {file.type !== "file" ? (
            <EmptyTabState
              title="Incoming imports are file-specific"
              description="Select a file to inspect which other internal files depend on it."
            />
          ) : parseDataLoading ? (
            <RelationshipLoadingSkeleton />
          ) : !parseData ? (
            <EmptyTabState
              title="No parse data yet"
              description="Semantic analysis has not produced incoming dependency information for this file yet."
            />
          ) : parseData.importedBy.length === 0 ? (
            <EmptyTabState
              title="No internal files import this file yet"
              description="The current semantic index does not show any internal repo files depending on this file."
            />
          ) : (
            <RelationshipList
              items={parseData.importedBy.map((item) => ({
                id: item.id,
                title: item.sourceFilePath,
                titleBadge: item.importKind.replace(/_/g, " "),
                resolutionLabel: getResolutionKindLabel(item.resolutionKind),
                resolutionClassName: getResolutionKindBadgeClassName(
                  item.resolutionKind,
                ),
                targetLabel: "Module specifier",
                targetValue: item.moduleSpecifier,
                detailLabel: "Imported from",
                detailValue: item.sourceFilePath,
                location: `L${item.startLine}:${item.startCol}`,
                canNavigate: true,
                onNavigate: () => onNavigateToIncomingImport(item),
              }))}
            />
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="defines"
        className="rounded-lg border border-border/70 bg-background/70 px-4"
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-medium text-foreground">Defines symbols</span>
            <Badge variant="secondary">{parseData?.symbols.length ?? 0}</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {file.type !== "file" ? (
            <EmptyTabState
              title="Outline is available for files"
              description="Select a source file to inspect symbols and jump within the viewer."
            />
          ) : parseDataLoading ? (
            <RelationshipLoadingSkeleton />
          ) : !parseData ? (
            <EmptyTabState
              title="No parse data yet"
              description="Semantic analysis has not produced file symbols for this selection yet."
            />
          ) : parseData.symbols.length === 0 ? (
            <EmptyTabState
              title="No symbols found"
              description="This file does not currently expose functions, classes, interfaces, or other symbol definitions."
            />
          ) : (
            <div className="space-y-2">
              {parseData.symbols.map((symbol) => (
                <button
                  key={symbol.id}
                  type="button"
                  onClick={() => onNavigateToSymbol(symbol)}
                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {symbol.displayName}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize border font-medium shadow-sm",
                          getTitleBadgeClassName(
                            symbol.kind.replace(/_/g, " "),
                          ) || "border-border bg-muted text-foreground",
                        )}
                      >
                        {symbol.kind.replace(/_/g, " ")}
                      </Badge>
                      {symbol.isExported ? (
                        <Badge variant="outline">Exported</Badge>
                      ) : null}
                    </div>
                    {symbol.signature ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {symbol.signature}
                      </p>
                    ) : null}
                    {symbol.parentSymbolName ? (
                      <p className="text-xs text-muted-foreground">
                        In {symbol.parentSymbolName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {symbol.startLine ? `L${symbol.startLine}` : "No range"}
                    <ClickHintIcon />
                  </div>
                </button>
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="exports"
        className="rounded-lg border border-border/70 bg-background/70 px-4"
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-medium text-foreground">Exports</span>
            <Badge variant="secondary">{parseData?.exports.length ?? 0}</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {file.type !== "file" ? (
            <EmptyTabState
              title="Exports are file-specific"
              description="Select a file to inspect its export surface."
            />
          ) : parseDataLoading ? (
            <RelationshipLoadingSkeleton />
          ) : !parseData ? (
            <EmptyTabState
              title="No parse data yet"
              description="Semantic analysis has not produced export information for this file yet."
            />
          ) : parseData.exports.length === 0 ? (
            <EmptyTabState
              title="No exports found"
              description="This file does not currently expose named, default, wildcard, or re-exports."
            />
          ) : (
            <div className="space-y-2">
              {parseData.exports.map((item) => (
                <ClickableCard
                  key={item.id}
                  onClick={() => onNavigateToExport(item)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Binary className="size-4 text-muted-foreground" />
                    <p className="font-medium text-foreground">
                      {item.exportName}
                    </p>
                    <Badge variant="secondary" className="capitalize">
                      {item.exportKind.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline">
                      {hasLinkedExportDeclaration(item)
                        ? "Declaration linked"
                        : "Export line only"}
                    </Badge>
                    <ClickHintIcon />
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>Symbol: {item.symbolDisplayName ?? "Not linked"}</p>
                    <p>
                      Source module:{" "}
                      {item.sourceModuleSpecifier ?? "Local export"}
                    </p>
                    {hasLinkedExportDeclaration(item) ? (
                      <p className="text-foreground">Jump: declaration</p>
                    ) : (
                      <p>Jump: export statement</p>
                    )}
                    <p>
                      Location: L{item.startLine}:{item.startCol}
                    </p>
                  </div>
                </ClickableCard>
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
