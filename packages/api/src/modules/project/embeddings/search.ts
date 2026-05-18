import { sql } from "drizzle-orm";
import { createEmbeddingProvider, semanticSearchEnabled, type EmbeddingProvider } from "./provider";

export type SemanticCodeResult = {
  path: string;
  symbolName?: string;
  chunkType: string;
  startLine?: number;
  endLine?: number;
  score: number;
  reason: "semantic";
  snippet?: string;
  metadata?: Record<string, unknown>;
};

export async function semanticSearchCodebase(params: {
  db: any;
  projectId: string;
  query: string;
  limit?: number;
  filters?: { chunkTypes?: string[]; language?: string };
  provider?: EmbeddingProvider;
}): Promise<SemanticCodeResult[]> {
  if (!semanticSearchEnabled()) return [];

  const provider = params.provider ?? createEmbeddingProvider();
  const [queryEmbedding] = await provider.embedTexts([params.query]);
  const vector = `[${queryEmbedding.join(",")}]`;
  const limit = params.limit ?? 10;
  const chunkTypes = params.filters?.chunkTypes;

  const rows = await params.db.execute(sql`
    SELECT
      ce.path,
      rs.display_name AS "symbolName",
      ce.chunk_type AS "chunkType",
      ce.start_line AS "startLine",
      ce.end_line AS "endLine",
      ce.content,
      ce.metadata,
      1 - (ce.embedding <=> ${vector}::vector) AS score
    FROM code_embeddings ce
    LEFT JOIN repo_symbol rs ON rs.id = ce.symbol_id
    WHERE ce.project_id = ${params.projectId}
      AND ce.deleted_at IS NULL
      AND ce.model = ${provider.model}
      AND ce.dimensions = ${provider.dimensions}
      ${params.filters?.language ? sql`AND ce.language = ${params.filters.language}` : sql``}
      ${chunkTypes?.length ? sql`AND ce.chunk_type = ANY(${chunkTypes})` : sql``}
    ORDER BY ce.embedding <=> ${vector}::vector
    LIMIT ${limit}
  `);

  return Array.from(rows as any).map((row: any) => ({
    path: row.path,
    symbolName: row.symbolName ?? undefined,
    chunkType: row.chunkType,
    startLine: row.startLine ?? undefined,
    endLine: row.endLine ?? undefined,
    score: Number(row.score),
    reason: "semantic",
    snippet: makeSnippet(row.content),
    metadata: row.metadata ?? undefined,
  }));
}

function makeSnippet(content: string) {
  return content.length > 600 ? `${content.slice(0, 600)}…` : content;
}
