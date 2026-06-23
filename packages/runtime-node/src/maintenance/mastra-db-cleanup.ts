import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { loadSettings, writeSettings } from "../settings.ts";

const execFileAsync = promisify(execFile);

const SPAN_RETENTION_DAYS = 14;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day
// mastra_ai_spans has no index on createdAt, but rows are inserted in
// chronological order, so a rowid + LIMIT scan finds old rows without
// touching the whole table. Batching also keeps each write transaction short.
const DELETE_BATCH_SIZE = 2000;
// Callers only run this after the chat harness has shut down its storage
// connection, but we still cap total time so process exit never hangs on a
// large backlog — any remainder is picked up on a later exit. A single batch
// can be unexpectedly slow on a multi-GB file with a cold page cache, so each
// batch's own timeout is capped to whatever budget remains (see below).
const CLEANUP_TIME_BUDGET_MS = 8_000;
const MIN_BATCH_TIMEOUT_MS = 1_000;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getMastraAppDataDir(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "mastracode");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "mastracode");
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "mastracode");
}

function getMastraDbPath(): string {
  if (process.env.MASTRA_DB_PATH) return process.env.MASTRA_DB_PATH;
  return path.join(getMastraAppDataDir(), "mastra.db");
}

/** Deletes one batch of old spans and returns how many rows were removed. */
async function deleteSpanBatch(dbPath: string, cutoff: string, timeoutMs: number): Promise<number> {
  const { stdout } = await execFileAsync(
    "sqlite3",
    [
      dbPath,
      `DELETE FROM mastra_ai_spans WHERE rowid IN (SELECT rowid FROM mastra_ai_spans WHERE createdAt < '${cutoff}' LIMIT ${DELETE_BATCH_SIZE}); SELECT changes();`,
    ],
    { timeout: timeoutMs },
  );
  return parseInt(stdout.trim(), 10) || 0;
}

function wasKilledByTimeout(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "killed" in err && (err as { killed?: boolean }).killed);
}

/**
 * Best-effort cleanup of old ai_spans from mastra.db.
 *
 * Callers must only invoke this once the chat harness has shut down its own
 * storage connection — running it during an active session contends with
 * the harness for the same SQLite write lock. Runs at most once per day and
 * bails out after a short time budget so it never blocks process exit; a
 * large backlog is drained incrementally across exits instead of in one go.
 */
export async function maybeCleanupMastraDb(): Promise<void> {
  if (process.platform !== "darwin" && process.platform !== "linux") return;

  const settings = await loadSettings();
  const lastCleanup = settings.maintenance?.lastSpanCleanupAt ?? 0;
  if (Date.now() - lastCleanup < CLEANUP_INTERVAL_MS) return;

  const dbPath = getMastraDbPath();
  if (!(await fileExists(dbPath))) return;

  const cutoff = new Date(Date.now() - SPAN_RETENTION_DAYS * 86400_000).toISOString();
  const deadline = Date.now() + CLEANUP_TIME_BUDGET_MS;

  try {
    let totalDeleted = 0;
    let drainedBacklog = false;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_BATCH_TIMEOUT_MS) break;

      let deleted: number;
      try {
        deleted = await deleteSpanBatch(dbPath, cutoff, remaining);
      } catch (err) {
        // Hit the time budget mid-batch — normal for a large backlog on a
        // multi-GB file, not a real failure. Stop and resume next exit.
        if (wasKilledByTimeout(err)) break;
        throw err;
      }

      totalDeleted += deleted;
      if (deleted < DELETE_BATCH_SIZE) {
        drainedBacklog = true;
        break;
      }
    }

    if (totalDeleted > 0) {
      await execFileAsync("sqlite3", [dbPath, "PRAGMA wal_checkpoint(PASSIVE);"], { timeout: 10_000 });
      console.debug(`[cleanup] removed ${totalDeleted} spans older than ${SPAN_RETENTION_DAYS} days`);
    }

    // Only mark today's cleanup as done once the backlog is fully drained —
    // otherwise the next exit retries sooner than 24h so a large backlog
    // (e.g. right after lowering retention) clears over a few sessions.
    if (drainedBacklog) {
      await writeSettings("global", { maintenance: { lastSpanCleanupAt: Date.now() } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("no such table: mastra_ai_spans")) {
      await writeSettings("global", { maintenance: { lastSpanCleanupAt: Date.now() } });
      return;
    }
    console.debug("[cleanup] mastra span cleanup failed:", err);
  }
}
