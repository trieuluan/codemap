import { and, eq, inArray, sql } from "drizzle-orm";
import { codeEmbedding, embeddingIndexRun } from "../../../db/schema";
import { buildEmbeddingChunks, estimateTokens, type EmbeddingChunk } from "./chunker";
import { createEmbeddingProvider, embeddingsEnabled, getEmbeddingConfig, type EmbeddingProvider } from "./provider";

export async function indexProjectEmbeddings(params: {
  db: any;
  projectId: string;
  projectImportId: string;
  workspacePath: string;
  provider?: EmbeddingProvider;
}) {
  if (!embeddingsEnabled()) return null;

  const provider = params.provider ?? createEmbeddingProvider();
  const config = getEmbeddingConfig();

  // Cancel any in-progress runs for this project before starting a new one.
  await params.db.update(embeddingIndexRun)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(
      eq(embeddingIndexRun.projectId, params.projectId),
      inArray(embeddingIndexRun.status, ["queued", "running"]),
    ));

  const [run] = await params.db.insert(embeddingIndexRun).values({
    projectId: params.projectId,
    projectImportId: params.projectImportId,
    status: "running",
    model: provider.model,
    dimensions: provider.dimensions,
    startedAt: new Date(),
  }).returning();

  try {
    const files = await params.db.execute(sql`
      SELECT id, path, language, is_text AS "isText", is_generated AS "isGenerated", is_ignored AS "isIgnored", line_count AS "lineCount"
      FROM repo_file WHERE project_import_id = ${params.projectImportId}
    `);
    const symbols = await params.db.execute(sql`
      SELECT s.id, s.file_id AS "fileId", s.display_name AS "displayName", s.kind, s.language, s.signature,
             MIN(o.start_line) AS "startLine", MAX(o.end_line) AS "endLine"
      FROM repo_symbol s
      LEFT JOIN repo_symbol_occurrence o ON o.symbol_id = s.id AND o.occurrence_role IN ('definition', 'declaration')
      WHERE s.project_import_id = ${params.projectImportId}
      GROUP BY s.id
    `);

    const t0 = Date.now();
    const chunks = await buildEmbeddingChunks({
      projectId: params.projectId,
      workspacePath: params.workspacePath,
      files: Array.from(files as any),
      symbols: Array.from(symbols as any),
    });
    const tokensEstimated = chunks.reduce((sum, chunk) => sum + estimateTokens(chunk.content), 0);
    console.info("[embed] chunking", { ms: Date.now() - t0, chunks: chunks.length });

    const existing = (chunks.length
      ? await params.db.select({ chunkKey: codeEmbedding.chunkKey, contentHash: codeEmbedding.contentHash, model: codeEmbedding.model, dimensions: codeEmbedding.dimensions })
          .from(codeEmbedding)
          .where(inArray(codeEmbedding.chunkKey, chunks.map((chunk) => chunk.chunkKey)))
      : []) as Array<{ chunkKey: string; contentHash: string; model: string; dimensions: number }>;
    const existingByKey = new Map(existing.map((row) => [row.chunkKey, row]));
    const changed = chunks.filter((chunk) => {
      const row = existingByKey.get(chunk.chunkKey);
      return !row || row.contentHash !== chunk.contentHash || row.model !== provider.model || row.dimensions !== provider.dimensions;
    });
    const skipped = chunks.length - changed.length;

    console.info("[embed] dedup", { ms: Date.now() - t0, total: chunks.length, changed: changed.length, skipped });

    if (existing.some((row: any) => row.model !== provider.model || row.dimensions !== provider.dimensions)) {
      await params.db.delete(codeEmbedding).where(sql`${codeEmbedding.projectId} = ${params.projectId}`);
    }

    // Set total upfront so UI can show progress from the start.
    // chunksTotal = full project chunk count (consistent with completed state).
    // chunksToEmbed = delta actually being processed this run (skipped chunks excluded).
    await params.db.update(embeddingIndexRun).set({
      chunksTotal: chunks.length,
      chunksToEmbed: changed.length,
      tokensEstimated,
    }).where(sql`${embeddingIndexRun.id} = ${run.id}`);

    const tEmbed = Date.now();
    let embedded = 0;
    const batchTimings: number[] = [];
    // pendingInsert lets embed[N+1] overlap with insert[N] + progress update[N].
    let pendingInsert: Promise<void> = Promise.resolve();

    for (const [batchIndex, batch] of batchChunks(changed, config.batchSize, config.tokenBudget).entries()) {
      // Check cancellation every 5 batches to reduce DB round-trips.
      // Drain pendingInsert first so the check sees a consistent state.
      if (batchIndex % 5 === 0) {
        await pendingInsert;
        const [current] = await params.db.select({ status: embeddingIndexRun.status })
          .from(embeddingIndexRun)
          .where(eq(embeddingIndexRun.id, run.id))
          .limit(1);
        if (current?.status === "cancelled") {
          console.info("Embedding run cancelled by newer import", { runId: run.id, projectId: params.projectId });
          return null;
        }
      }

      // Embed current batch — runs concurrently with the previous batch's pendingInsert.
      const tBatch = Date.now();
      const vectors = await embedWithRetry(provider, batch.map((chunk) => chunk.content));
      batchTimings.push(Date.now() - tBatch);
      const rows = batch.map((chunk, index) =>
        toEmbeddingRow(params.projectId, provider, chunk, vectors[index]!),
      );

      // Wait for previous insert before kicking off the next one (ordered progress updates).
      await pendingInsert;
      embedded += batch.length;
      const progressSnapshot = embedded;
      pendingInsert = (async () => {
        await params.db.insert(codeEmbedding).values(rows).onConflictDoUpdate({
          target: [codeEmbedding.projectId, codeEmbedding.chunkKey],
          set: {
            fileId: sql`excluded.file_id`,
            path: sql`excluded.path`,
            symbolId: sql`excluded.symbol_id`,
            chunkType: sql`excluded.chunk_type`,
            language: sql`excluded.language`,
            content: sql`excluded.content`,
            contentHash: sql`excluded.content_hash`,
            embedding: sql`excluded.embedding`,
            model: sql`excluded.model`,
            dimensions: sql`excluded.dimensions`,
            startLine: sql`excluded.start_line`,
            endLine: sql`excluded.end_line`,
            metadata: sql`excluded.metadata`,
            deletedAt: null,
            updatedAt: new Date(),
          },
        });
        await params.db.update(embeddingIndexRun)
          .set({ chunksEmbedded: progressSnapshot })
          .where(sql`${embeddingIndexRun.id} = ${run.id}`);
      })();
    }

    // Drain the last batch's insert + progress update before proceeding.
    await pendingInsert;
    const minBatch = Math.min(...batchTimings);
    const maxBatch = Math.max(...batchTimings);
    const avgBatch = batchTimings.length ? Math.round(batchTimings.reduce((a, b) => a + b, 0) / batchTimings.length) : 0;
    console.info("[embed] embedding+insert", { ms: Date.now() - tEmbed, embedded, batches: batchTimings.length, batchMs: { min: minBatch, max: maxBatch, avg: avgBatch } });

    if (chunks.length) {
      await params.db.delete(codeEmbedding).where(sql`${codeEmbedding.projectId} = ${params.projectId} AND ${codeEmbedding.chunkKey} NOT IN (${sql.join(chunks.map((chunk) => sql`${chunk.chunkKey}`), sql`, `)})`);
    }

    await params.db.update(embeddingIndexRun).set({
      status: "completed",
      chunksTotal: chunks.length,
      chunksEmbedded: embedded,
      chunksSkipped: skipped,
      tokensEstimated,
      completedAt: new Date(),
    }).where(sql`${embeddingIndexRun.id} = ${run.id}`);

    console.info("Embedding index completed", { projectId: params.projectId, chunksTotal: chunks.length, embedded, skipped, tokensEstimated });
    return { chunksTotal: chunks.length, chunksEmbedded: embedded, chunksSkipped: skipped, tokensEstimated };
  } catch (error) {
    await params.db.update(embeddingIndexRun).set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 1000) : String(error), completedAt: new Date() }).where(sql`${embeddingIndexRun.id} = ${run.id}`);
    console.warn("Embedding index failed", { projectId: params.projectId, error });
    return null;
  }
}

function toEmbeddingRow(projectId: string, provider: EmbeddingProvider, chunk: EmbeddingChunk, embedding: number[]) {
  return { projectId, fileId: chunk.fileId ?? null, path: chunk.path, symbolId: chunk.symbolId ?? null, chunkKey: chunk.chunkKey, chunkType: chunk.chunkType, language: chunk.language ?? null, content: chunk.content, contentHash: chunk.contentHash, embedding, model: provider.model, dimensions: provider.dimensions, startLine: chunk.startLine ?? null, endLine: chunk.endLine ?? null, metadata: chunk.metadata ?? {} };
}

function batchChunks(chunks: EmbeddingChunk[], maxInputs: number, tokenBudget: number) {
  const batches: EmbeddingChunk[][] = [];
  let current: EmbeddingChunk[] = [];
  let tokens = 0;
  for (const chunk of chunks) {
    const nextTokens = estimateTokens(chunk.content);
    if (current.length && (current.length >= maxInputs || tokens + nextTokens > tokenBudget)) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(chunk);
    tokens += nextTokens;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function embedWithRetry(provider: EmbeddingProvider, texts: string[]) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await provider.embedTexts(texts); } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}
