import { SQLiteIndexStore, sqliteIndexDbPath } from "@codemap-ai/core/lib/sqlite-index-store.js";
import { buildGraphData, type GraphData } from "@codemap-ai/core/graph/builder.js";

function openLocalIndex(workspacePath: string): SQLiteIndexStore {
  const dbPath = sqliteIndexDbPath(workspacePath);
  if (!SQLiteIndexStore.exists(dbPath)) {
    throw new Error(`Local index not found for workspace: ${workspacePath}`);
  }
  const store = SQLiteIndexStore.open(dbPath);
  if (!store.getMeta()) {
    throw new Error(`Local index not found for workspace: ${workspacePath}`);
  }
  return store;
}

export async function getLocalGraphData(
  workspacePath: string,
  options?: { monorepoAware?: boolean },
): Promise<GraphData> {
  const store = openLocalIndex(workspacePath);

  const localFiles = store.getAllFilePaths().map((path) => ({
    id: path,
    path,
    language: null,
    isParseable: true,
  }));

  const edges = store.getGraphEdges();

  return buildGraphData(localFiles, edges, options);
}
