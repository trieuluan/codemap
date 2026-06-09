import { SQLiteIndexStore } from "./sqlite-index-store.js";
import { SymbolDependencyGraph } from "./symbol-dependency.js";
import type { FileWatchEvent } from "./file-watcher.js";

export interface WatchEventHandlerConfig {
  store: SQLiteIndexStore;
  symbolDependencyGraph: SymbolDependencyGraph;
  onReindexFile: (filePath: string) => Promise<void>;
  onBatchReindex: (filePaths: string[]) => Promise<void>;
}

/**
 * Handles file watch events and decides which files should be reindexed
 * based on whether they actually import changed symbols.
 */
export class WatchEventHandler {
  private config: WatchEventHandlerConfig;
  private graph: SymbolDependencyGraph;

  constructor(config: WatchEventHandlerConfig) {
    this.config = config;
    this.graph = config.symbolDependencyGraph;
  }

  /**
   * Process a file watch event and determine if/which files should be reindexed.
   */
  async handleEvent(event: FileWatchEvent): Promise<void> {
    switch (event.type) {
      case "create":
        await this.handleFileCreate(event);
        break;

      case "update":
        await this.handleFileUpdate(event);
        break;

      case "delete":
        await this.handleFileDelete(event);
        break;
    }
  }

  private async handleFileCreate(event: FileWatchEvent): Promise<void> {
    console.log(`[WatchEventHandler] New file detected: ${event.relativePath}`);
    await this.config.onReindexFile(event.relativePath);
    this.graph.updateFile(this.config.store, event.relativePath);
  }

  private getExportNames(filePath: string): Set<string> {
    const parse = this.config.store.getFileParse(filePath);
    if (!parse) return new Set();
    return new Set(parse.exports.map((e) => e.exportName));
  }

  private async handleFileUpdate(event: FileWatchEvent): Promise<void> {
    const filePath = event.relativePath;
    const importers = this.graph.getImporters(filePath);

    if (importers.size === 0) {
      // No dependents — just reindex the changed file
      console.log(`[WatchEventHandler] File updated: ${filePath} (no dependents)`);
      await this.config.onReindexFile(filePath);
      this.graph.updateFile(this.config.store, filePath);
      return;
    }

    // Snapshot exports before reindex so we can detect changes
    const exportsBefore = this.getExportNames(filePath);

    await this.config.onReindexFile(filePath);
    this.graph.updateFile(this.config.store, filePath);

    // Check if exported symbols actually changed
    const exportsAfter = this.getExportNames(filePath);
    const exportsChanged =
      exportsBefore.size !== exportsAfter.size ||
      [...exportsBefore].some((name) => !exportsAfter.has(name)) ||
      [...exportsAfter].some((name) => !exportsBefore.has(name));

    if (!exportsChanged) {
      console.log(`[WatchEventHandler] File updated: ${filePath} (exports unchanged, skipping ${importers.size} dependents)`);
      return;
    }

    // Exports changed — reindex dependent files
    const dependentFiles = Array.from(importers.keys());
    console.log(`[WatchEventHandler] File updated: ${filePath} (exports changed, reindexing ${dependentFiles.length} dependents)`);
    await this.config.onBatchReindex(dependentFiles);

    for (const importer of dependentFiles) {
      this.graph.updateFile(this.config.store, importer);
    }
  }

  private async handleFileDelete(event: FileWatchEvent): Promise<void> {
    const filePath = event.relativePath;
    console.log(`[WatchEventHandler] File deleted: ${filePath}`);

    // Remove from index
    this.config.store.removeFileFromIndex(filePath);

    // Get importers before removing from graph
    const importers = this.graph.getImporters(filePath);

    // Remove from dependency graph (cleans both edges and reverseEdges)
    this.graph.removeFile(filePath);

    // Reindex importers to remove stale imports
    for (const importer of importers.keys()) {
      try {
        await this.config.onReindexFile(importer);
        this.graph.updateFile(this.config.store, importer);
      } catch (err) {
        console.error(`[WatchEventHandler] Error reindexing importer ${importer}:`, err);
      }
    }
  }
}
