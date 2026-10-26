import { SQLiteIndexStore, sqliteIndexDbPath } from "@codemap-ai/core/lib/sqlite-index-store.js";
import { buildGraphData, type GraphData } from "@codemap-ai/core/graph/builder.js";
import { buildSymbolGraph } from "@codemap-ai/core/graph/symbol-graph.js";

function openLocalIndex(workspacePath: string): SQLiteIndexStore {
  const dbPath = sqliteIndexDbPath(workspacePath);
  if (!SQLiteIndexStore.exists(dbPath)) {
    throw new Error(`Local index not found for workspace: ${workspacePath}`);
  }
  const store = SQLiteIndexStore.open(dbPath);
  if (!store.getMeta()) {
    store.close();
    throw new Error(`Local index not found for workspace: ${workspacePath}`);
  }
  return store;
}

export async function getLocalGraphData(
  workspacePath: string,
  options?: { monorepoAware?: boolean },
): Promise<GraphData> {
  const store = openLocalIndex(workspacePath);

  try {
  const localFiles = store.getAllFilePaths().map((path) => ({
    id: path,
    path,
    language: null,
    isParseable: true,
  }));

  const edges = store.getGraphEdges();

  const graph = buildGraphData(localFiles, edges, options);
  return { ...graph, ...buildSymbolGraph(store.getGraphSymbols(), new Set(graph.nodes.map((node) => node.id)), edges) };
  } finally { store.close(); }
}
