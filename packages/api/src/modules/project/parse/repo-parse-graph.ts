export type * from "./types/repo-parse-graph.types";

import { createDiffService } from "./graph/diff";
import { createFileQueryService } from "./graph/file-queries";
import { createGraphService } from "./graph/graph";
import { createImportEdgeQueryService } from "./graph/import-edge-queries";
import { createInsightsService } from "./graph/insights";
import { createSearchService } from "./graph/search";
import { createWriteService } from "./graph/write";

type Database = typeof import("../../../db/index.ts").db;

export function createRepoParseGraphService(database: Database) {
  return {
    ...createWriteService(database),
    ...createFileQueryService(database),
    ...createImportEdgeQueryService(database),
    ...createInsightsService(database),
    ...createGraphService(database),
    ...createSearchService(database),
    ...createDiffService(database),
  };
}
