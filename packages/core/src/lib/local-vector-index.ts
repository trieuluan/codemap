import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { SQLiteIndexStore } from "./sqlite-index-store.ts";
import { debugLog } from "./debug-log.ts";

const MODEL_ID = "fastembed-bge-small-en-v1.5";
const BATCH_SIZE = 32;

interface EmbedderLike {
  doEmbed(input: { values: string[] }): Promise<{ embeddings: number[][] }>;
}

let embedderPromise: Promise<EmbedderLike | null> | null = null;
const warmInFlight = new Map<SQLiteIndexStore, Promise<{ embedded: number; cached: number; total: number }>>();

function isVectorDisabled(): boolean {
  return process.env.CODEMAP_DISABLE_VECTOR === "1";
}

async function getEmbedder(): Promise<EmbedderLike | null> {
  if (isVectorDisabled()) return null;
  if (!embedderPromise) {
    embedderPromise = import("@mastra/fastembed")
      .then((mod) => mod.fastembed.small as unknown as EmbedderLike)
      .catch((err) => {
        debugLog("[LocalVector] fastembed unavailable:", err);
        return null;
      });
  }
  return embedderPromise;
}

function openGlobalVectorCache(): DatabaseSync | null {
  try {
    const cacheDir = path.join(homedir(), ".codemap");
    mkdirSync(cacheDir, { recursive: true });
    const db = new DatabaseSync(path.join(cacheDir, "vector-cache.db"));
    db.exec("PRAGMA journal_mode=WAL;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS vector_cache (
        textSha256 TEXT NOT NULL,
        modelId TEXT NOT NULL,
        vector BLOB NOT NULL,
        PRIMARY KEY (textSha256, modelId)
      );
    `);
    return db;
  } catch {
    return null;
  }
}

export async function embedQueryText(text: string): Promise<Float32Array | null> {
  const embedder = await getEmbedder();
  if (!embedder) return null;
  try {
    const res = await embedder.doEmbed({ values: [text] });
    const vec = res.embeddings[0];
    return vec ? Float32Array.from(vec) : null;
  } catch (err) {
    debugLog("[LocalVector] embedQueryText failed:", err);
    return null;
  }
}

export async function warmLocalVectorIndex(
  store: SQLiteIndexStore,
): Promise<{ embedded: number; cached: number; total: number }> {
  if (isVectorDisabled()) return { embedded: 0, cached: 0, total: 0 };

  const existing = warmInFlight.get(store);
  if (existing) return existing;

  const task = (async () => {
    const summaries = store.getFileVectorSummaries();
    if (summaries.length === 0) return { embedded: 0, cached: 0, total: 0 };

    const storedHashes = store.getStoredVectorHashes();
    const stale = summaries.filter((s) => storedHashes.get(s.filePath) !== s.textSha256);
    if (stale.length === 0) {
      return { embedded: 0, cached: summaries.length, total: summaries.length };
    }

    const globalCache = openGlobalVectorCache();
    const toUpsert: Array<{ filePath: string; textSha256: string; vector: Float32Array }> = [];
    const needEmbed: typeof stale = [];
    let cachedCount = summaries.length - stale.length;

    try {
      const lookupStmt = globalCache?.prepare(
        "SELECT vector FROM vector_cache WHERE textSha256 = ? AND modelId = ?",
      );

      for (const item of stale) {
        const hit = lookupStmt?.get(item.textSha256, MODEL_ID) as
          | { vector: Uint8Array }
          | undefined;
        if (hit?.vector) {
          const f32 = new Float32Array(
            hit.vector.buffer,
            hit.vector.byteOffset,
            Math.floor(hit.vector.byteLength / 4),
          );
          toUpsert.push({
            filePath: item.filePath,
            textSha256: item.textSha256,
            vector: Float32Array.from(f32),
          });
          cachedCount++;
        } else {
          needEmbed.push(item);
        }
      }

      if (toUpsert.length > 0) {
        store.upsertFileVectors(toUpsert);
        toUpsert.length = 0;
      }

      if (needEmbed.length > 0) {
        const embedder = await getEmbedder();
        if (embedder) {
          const insertGlobal = globalCache?.prepare(
            "INSERT OR REPLACE INTO vector_cache(textSha256, modelId, vector) VALUES(?, ?, ?)",
          );
          let embedded = 0;

          for (let i = 0; i < needEmbed.length; i += BATCH_SIZE) {
            const batch = needEmbed.slice(i, i + BATCH_SIZE);
            const res = await embedder.doEmbed({
              values: batch.map((b) => b.summaryText),
            });

            const batchRows: Array<{ filePath: string; textSha256: string; vector: Float32Array }> = [];
            for (let j = 0; j < batch.length; j++) {
              const raw = res.embeddings[j];
              if (!raw) continue;
              const vec = Float32Array.from(raw);
              const item = batch[j]!;
              batchRows.push({
                filePath: item.filePath,
                textSha256: item.textSha256,
                vector: vec,
              });
              if (insertGlobal) {
                const bytes = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
                insertGlobal.run(item.textSha256, MODEL_ID, bytes);
              }
              embedded++;
            }
            store.upsertFileVectors(batchRows);
          }
          debugLog(`[LocalVector] Embedded ${embedded} files (${cachedCount} cached)`);
          return { embedded, cached: cachedCount, total: summaries.length };
        }
      }

      return { embedded: 0, cached: cachedCount, total: summaries.length };
    } finally {
      globalCache?.close();
    }
  })().finally(() => {
    warmInFlight.delete(store);
  });

  warmInFlight.set(store, task);
  return task;
}

export async function searchLocalSemantic(
  store: SQLiteIndexStore,
  query: string,
  limit = 10,
  ensureWarmed = false,
): Promise<Array<{ path: string; language: string | null; score: number }>> {
  if (isVectorDisabled()) return [];
  if (ensureWarmed) {
    await warmLocalVectorIndex(store);
  }
  const queryVec = await embedQueryText(query);
  if (!queryVec) return [];
  return store.searchSemantic(queryVec, limit);
}
