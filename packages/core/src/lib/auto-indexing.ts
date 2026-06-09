import { IndexWatcher } from "./file-watcher.js";
import { SymbolDependencyGraph } from "./symbol-dependency.js";
import { WatchEventHandler } from "./watch-event-handler.js";
import type { SQLiteIndexStore } from "./sqlite-index-store.js";
import { refreshLocalFile, refreshLocalFiles } from "./local-index.js";

// Module-level state
let _watcher: IndexWatcher | null = null;
let _dependencyGraph: SymbolDependencyGraph | null = null;
let _eventHandler: WatchEventHandler | null = null;

/**
 * Configuration for the file watcher callbacks.
 */
export interface AutoIndexingCallbacks {
  /** Called when a single file needs reindexing */
  onFileChange: (filePath: string) => Promise<void>;
  
  /** Called when multiple files need batch reindexing */
  onBatchChanges: (filePaths: string[]) => Promise<void>;
}

/**
 * Enable automatic file watching for the workspace.
 * This starts an async watcher that automatically reindexes files when they change.
 */
export async function enableAutoIndexing(
  store: SQLiteIndexStore,
  workspaceRootPath: string,
): Promise<void> {
  if (_watcher) {
    if (_watcher.isActive()) {
      console.log("[AutoIndexing] Already active");
      return;
    }
    // Stale reference — watcher exists but stopped; clean up before restarting
    await _watcher.stop().catch(() => {});
    _watcher = null;
    _dependencyGraph = null;
    _eventHandler = null;
  }

  // Build dependency graph from existing index
  _dependencyGraph = new SymbolDependencyGraph();
  _dependencyGraph.buildFromStore(store);

  // Default callbacks that actually work
  const defaultCallbacks: AutoIndexingCallbacks = {
    onFileChange: async (filePath: string) => {
      try {
        await refreshLocalFile(filePath, workspaceRootPath);
        console.log(`[AutoIndexing] Reindexed: ${filePath}`);
      } catch (err) {
        console.error(`[AutoIndexing] Failed to reindex ${filePath}:`, err);
      }
    },
    onBatchChanges: async (filePaths: string[]) => {
      try {
        await refreshLocalFiles(filePaths, workspaceRootPath);
        console.log(`[AutoIndexing] Batch reindexed ${filePaths.length} files`);
      } catch (err) {
        console.error(`[AutoIndexing] Batch reindex failed:`, err);
      }
    },
  };

  // Create event handler with default callbacks
  _eventHandler = new WatchEventHandler({
    store,
    symbolDependencyGraph: _dependencyGraph,
    onReindexFile: defaultCallbacks.onFileChange,
    onBatchReindex: defaultCallbacks.onBatchChanges,
  });

  // Start watcher
  _watcher = new IndexWatcher({
    workspaceRootPath,
    onEvent: async (event) => {
      try {
        await _eventHandler!.handleEvent(event);
      } catch (err) {
        console.error(`[AutoIndexing] Error handling watch event:`, err);
      }
    },
  });

  await _watcher.start();
  console.log("[AutoIndexing] Started for:", workspaceRootPath);
}

/**
 * Disable automatic file watching.
 */
export async function disableAutoIndexing(): Promise<void> {
  if (!_watcher?.isActive()) {
    return;
  }

  await _watcher.stop();
  _watcher = null;
  _dependencyGraph = null;
  _eventHandler = null;
  console.log("[AutoIndexing] Stopped");
}

/**
 * Check if auto-indexing is currently active.
 */
export function isAutoIndexingActive(): boolean {
  return _watcher?.isActive() ?? false;
}

/**
 * Restart the auto-indexing watcher with the current store state.
 */
export async function restartAutoIndexing(
  store: SQLiteIndexStore,
  workspaceRootPath: string,
): Promise<void> {
  await disableAutoIndexing();
  await enableAutoIndexing(store, workspaceRootPath);
}
