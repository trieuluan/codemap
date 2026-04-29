import { browserProjectsApi, type ProjectImport } from "@/features/projects/api";
import type { ImportComparison } from "./types";

/**
 * Fetch a backend-computed comparison between two imports.
 *
 * The web UI renders this response only; file, symbol, edge, and metric diffing
 * all live in the API so compare behavior stays consistent across clients.
 */
export async function compareProjectImports(
  projectId: string,
  base: ProjectImport,
  head: ProjectImport,
): Promise<ImportComparison> {
  const comparison = await browserProjectsApi.compareProjectImports(projectId, {
    base: base.id,
    head: head.id,
  });

  return {
    base,
    head,
    files: comparison.files,
    symbols: comparison.symbols,
    edges: comparison.edges,
    metrics: comparison.metrics,
  };
}
