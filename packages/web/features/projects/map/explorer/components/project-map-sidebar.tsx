"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FileKind } from "@/lib/file-types";
import { FileTree } from "./file-tree-explorer";
import type { RepositoryTreeNode } from "../utils/file-tree-model";

interface ProjectMapSidebarProps {
  query: string;
  onQueryChange: (value: string) => void;
  kindFilter: FileKind | "all";
  onKindFilterChange: (value: FileKind | "all") => void;
  languageFilter: string | "all";
  onLanguageFilterChange: (value: string | "all") => void;
  availableKinds: FileKind[];
  availableLanguages: string[];
  isFiltering: boolean;
  filteredTree: RepositoryTreeNode[];
  selectedVisibleNodeId?: string;
  expandedNodeIds: string[];
  onSelectNode: (node: RepositoryTreeNode) => void;
  onExpandedChange: (ids: string[]) => void;
  onResetFilters: () => void;
}

export function ProjectMapSidebar({
  query,
  onQueryChange,
  kindFilter,
  onKindFilterChange,
  languageFilter,
  onLanguageFilterChange,
  availableKinds,
  availableLanguages,
  isFiltering,
  filteredTree,
  selectedVisibleNodeId,
  expandedNodeIds,
  onSelectNode,
  onExpandedChange,
  onResetFilters,
}: ProjectMapSidebarProps) {
  return (
    <div className="flex min-h-0 flex-col border-r border-border/70 bg-sidebar">
      <div className="space-y-3 border-b border-sidebar-border px-4 py-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Filter tree</p>
          <p className="text-xs text-muted-foreground">
            Narrow the visible files and folders in this explorer.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Filter visible files"
            className="pl-9"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Select
              value={kindFilter}
              onValueChange={(value: string) =>
                onKindFilterChange(value as FileKind | "all")
              }
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Filter kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {availableKinds.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Select
              value={languageFilter}
              onValueChange={(value: string) => onLanguageFilterChange(value)}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Filter language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {availableLanguages.map((language) => (
                  <SelectItem key={language} value={language}>
                    {language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {isFiltering ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {filteredTree.length > 0
                ? "Showing filtered repository results."
                : "No matching files or folders."}
            </p>
            <Button variant="ghost" size="sm" onClick={onResetFilters}>
              <X className="size-4" />
              Reset
            </Button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {filteredTree.length > 0 ? (
          <FileTree
            tree={filteredTree}
            selectedNodeId={selectedVisibleNodeId}
            expandedNodeIds={expandedNodeIds}
            onSelectNode={onSelectNode}
            onExpandedChange={onExpandedChange}
          />
        ) : (
          <Empty className="m-4 min-h-[220px] border border-dashed border-sidebar-border bg-sidebar p-6">
            <EmptyHeader>
              <EmptyTitle>No matching files</EmptyTitle>
              <EmptyDescription>
                Adjust the local tree filter to find a file in this repository
                snapshot.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={onResetFilters}>
                Reset filters
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </div>
  );
}
