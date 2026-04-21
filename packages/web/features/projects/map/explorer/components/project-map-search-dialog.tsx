"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CornerDownRight, FileCode2, Loader2 } from "lucide-react";
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
  ProjectMapSearchExportResult,
  ProjectMapSearchFileResult,
  ProjectMapSearchResponse,
  ProjectMapSearchSymbolResult,
} from "@/features/projects/api";
import type { ProjectViewerRange } from "./project-file-viewer";

interface ProjectMapSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  importId?: string | null;
  parseStatus?: ProjectImportParseStatus | null;
  onSelectFile: (item: ProjectMapSearchFileResult) => void;
  onSelectSymbol: (
    item: ProjectMapSearchSymbolResult,
    range?: ProjectViewerRange | null,
  ) => void;
  onSelectExport: (
    item: ProjectMapSearchExportResult,
    range: ProjectViewerRange,
  ) => void;
}

function toViewerRange(
  startLine?: number | null,
  startCol?: number | null,
  endLine?: number | null,
  endCol?: number | null,
) {
  if (!startLine || !startCol || !endLine || !endCol) {
    return null;
  }

  return {
    startLineNumber: startLine,
    startColumn: startCol,
    endLineNumber: endLine,
    endColumn: endCol,
  };
}

export function ProjectMapSearchDialog({
  open,
  onOpenChange,
  projectId,
  importId,
  parseStatus,
  onSelectFile,
  onSelectSymbol,
  onSelectExport,
}: ProjectMapSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

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

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Project search"
      description="Search files, symbols, and exports in this project."
      className="max-w-2xl"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Type a file path, symbol, or export name"
      />
      <CommandList className="max-h-[440px]">
        {query.trim().length < 2 ? (
          <CommandEmpty>Type at least 2 characters to search the project map.</CommandEmpty>
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
            {searchResults?.files.length ? (
              <CommandGroup heading="Files">
                {searchResults.files.map((item) => (
                  <CommandItem
                    key={`file:${item.path}`}
                    value={`file ${item.path} ${item.language ?? ""}`}
                    onSelect={() => {
                      onSelectFile(item);
                      closeDialog();
                    }}
                  >
                    <FileCode2 className="mt-0.5 size-4" />
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-mono text-xs">{item.path}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.language ?? "Unknown language"}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {searchResults?.symbols.length ? (
              <>
                {searchResults.files.length ? <CommandSeparator /> : null}
                <CommandGroup heading="Symbols">
                  {searchResults.symbols.map((item) => (
                    <CommandItem
                      key={`symbol:${item.id}`}
                      value={`symbol ${item.displayName} ${item.symbolKind} ${item.filePath} ${item.parentSymbolName ?? ""}`}
                      onSelect={() => {
                        onSelectSymbol(
                          item,
                          toViewerRange(
                            item.startLine,
                            item.startCol,
                            item.endLine,
                            item.endCol,
                          ),
                        );
                        closeDialog();
                      }}
                    >
                      <CornerDownRight className="mt-0.5 size-4" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.symbolKind.replace(/_/g, " ")} • {item.filePath}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
            {searchResults?.exports.length ? (
              <>
                {searchResults.files.length || searchResults.symbols.length ? (
                  <CommandSeparator />
                ) : null}
                <CommandGroup heading="Exports">
                  {searchResults.exports.map((item) => (
                    <CommandItem
                      key={`export:${item.id}`}
                      value={`export ${item.exportName} ${item.filePath}`}
                      onSelect={() => {
                        const linkedRange = toViewerRange(
                          item.symbolStartLine,
                          item.symbolStartCol,
                          item.symbolEndLine,
                          item.symbolEndCol,
                        );

                        onSelectExport(
                          item,
                          linkedRange ?? {
                            startLineNumber: item.startLine,
                            startColumn: item.startCol,
                            endLineNumber: item.endLine,
                            endColumn: item.endCol,
                          },
                        );
                        closeDialog();
                      }}
                    >
                      <CornerDownRight className="mt-0.5 size-4" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.exportName}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.filePath}
                        </p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
