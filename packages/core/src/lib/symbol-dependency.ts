import type { SQLiteIndexStore } from "./sqlite-index-store.js";

export interface SymbolDependencyEdge {
  sourceFilePath: string;
  targetFilePath: string;
  importedSymbols: Array<{
    displayName: string;
    kind: string;
  }>;
}

/**
 * Tracks which symbols from file B are imported and used by file A.
 * Used for smart blade-radius reindexing: when B changes, only reindex
 * files that import the changed symbols.
 */
export class SymbolDependencyGraph {
  private edges: Map<string, SymbolDependencyEdge[]> = new Map();
  private reverseEdges: Map<string, Set<string>> = new Map();

  /**
   * Build the dependency graph from the SQLite index store.
   * Call this once after initial index build or when restarting the watcher.
   */
  buildFromStore(store: SQLiteIndexStore): void {
    this.edges.clear();
    this.reverseEdges.clear();

    // Get all indexed file paths
    const allFilePaths = store.getAllFilePaths();

    for (const filePath of allFilePaths) {
      const fileParse = store.getFileParse(filePath);
      if (!fileParse) continue;

      const fileEdges: SymbolDependencyEdge[] = [];

      // For each import in this file, find what symbols are imported
      for (const imp of fileParse.imports) {
        if (!imp.targetPathText) continue;

        const targetFile = store.getFileParse(imp.targetPathText);
        if (!targetFile) continue;

        // Extract imported symbol names from the import
        const importedSymbols = this.extractImportedSymbols(
          imp,
          targetFile.exports,
        );

        if (importedSymbols.length > 0) {
          fileEdges.push({
            sourceFilePath: filePath,
            targetFilePath: imp.targetPathText,
            importedSymbols,
          });

          // Build reverse index: target -> sources
          if (!this.reverseEdges.has(imp.targetPathText)) {
            this.reverseEdges.set(imp.targetPathText, new Set());
          }
          this.reverseEdges.get(imp.targetPathText)!.add(filePath);
        }
      }

      if (fileEdges.length > 0) {
        this.edges.set(filePath, fileEdges);
      }
    }

    console.log(
      `[SymbolDependencyGraph] Built graph: ${this.edges.size} files with dependencies`,
    );
  }

  /**
   * Get all files that import symbols from the given file.
   * Returns a map of source file -> imported symbol names.
   */
  getImporters(targetFilePath: string): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();

    const importers = this.reverseEdges.get(targetFilePath);
    if (!importers) return result;

    for (const sourceFile of importers) {
      const edges = this.edges.get(sourceFile);
      if (!edges) continue;

      for (const edge of edges) {
        if (edge.targetFilePath === targetFilePath) {
          if (!result.has(sourceFile)) {
            result.set(sourceFile, new Set());
          }
          const symbolSet = result.get(sourceFile)!;
          for (const sym of edge.importedSymbols) {
            symbolSet.add(sym.displayName);
          }
        }
      }
    }

    return result;
  }

  /**
   * Get all files that should be reindexed when the given symbols in
   * targetFile change. Only returns files that actually import the
   * changed symbols, not all files that import targetFile.
   */
  getAffectedFiles(
    targetFilePath: string,
    changedSymbols: Set<string>,
  ): Set<string> {
    const affected = new Set<string>();

    const importers = this.getImporters(targetFilePath);

    for (const [sourceFile, importedSymbols] of importers) {
      // Check if any of the changed symbols are imported by this file
      for (const changedSymbol of changedSymbols) {
        if (importedSymbols.has(changedSymbol)) {
          affected.add(sourceFile);
          break;
        }
      }
    }

    return affected;
  }

  /**
   * Update the graph when a single file changes.
   * Call this after reindexing a file to keep the graph fresh.
   */
  updateFile(store: SQLiteIndexStore, filePath: string): void {
    // Remove old edges
    this.edges.delete(filePath);

    // Remove from reverse edges
    for (const [target, sources] of this.reverseEdges) {
      sources.delete(filePath);
      if (sources.size === 0) {
        this.reverseEdges.delete(target);
      }
    }

    // Rebuild edges for this file
    const fileParse = store.getFileParse(filePath);
    if (!fileParse) return;

    const fileEdges: SymbolDependencyEdge[] = [];

    for (const imp of fileParse.imports) {
      if (!imp.targetPathText) continue;

      const targetFile = store.getFileParse(imp.targetPathText);
      if (!targetFile) continue;

      const importedSymbols = this.extractImportedSymbols(
        imp,
        targetFile.exports,
      );

      if (importedSymbols.length > 0) {
        fileEdges.push({
          sourceFilePath: filePath,
          targetFilePath: imp.targetPathText,
          importedSymbols,
        });

        if (!this.reverseEdges.has(imp.targetPathText)) {
          this.reverseEdges.set(imp.targetPathText, new Set());
        }
        this.reverseEdges.get(imp.targetPathText)!.add(filePath);
      }
    }

    if (fileEdges.length > 0) {
      this.edges.set(filePath, fileEdges);
    }
  }

  /**
   * Remove a file from the graph (e.g., when it's deleted).
   */
  removeFile(filePath: string): void {
    this.edges.delete(filePath);

    for (const [target, sources] of this.reverseEdges) {
      sources.delete(filePath);
      if (sources.size === 0) {
        this.reverseEdges.delete(target);
      }
    }
  }

  /**
   * Get the number of files tracked in the graph.
   */
  size(): number {
    return this.edges.size;
  }

  private extractImportedSymbols(
    imp: any,
    targetExports: any[],
  ): Array<{ displayName: string; kind: string }> {
    const symbols: Array<{ displayName: string; kind: string }> = [];

    // Simplified extraction based on import kind
    if (imp.importKind === "namespace") {
      // import * as X from 'Y' - includes all exports
      for (const exp of targetExports) {
        if (exp.symbolDisplayName) {
          symbols.push({
            displayName: exp.symbolDisplayName,
            kind: exp.exportKind,
          });
        }
      }
    } else if (imp.importKind === "default") {
      // import X from 'Y' - only the default export
      const defaultExport = targetExports.find(
        (e) => e.exportKind === "default",
      );
      if (defaultExport?.symbolDisplayName) {
        symbols.push({
          displayName: defaultExport.symbolDisplayName,
          kind: "default",
        });
      }
    } else {
      // Named imports - we're conservative and track all named exports
      // In a more sophisticated version, we'd parse the actual import statement
      for (const exp of targetExports) {
        if (exp.exportKind === "named" && exp.symbolDisplayName) {
          symbols.push({
            displayName: exp.symbolDisplayName,
            kind: exp.exportKind,
          });
        }
      }
    }

    return symbols;
  }
}
