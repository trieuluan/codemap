import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { loadSettings, writeSettings } from "../settings.js";

const execFileAsync = promisify(execFile);

const SPAN_RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

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

/**
 * Fire-and-forget cleanup of old ai_spans from mastra.db.
 * Runs at most once per day. Stores last-run timestamp in ~/.codemap/settings.json.
 * Non-blocking — never awaits at the top level.
 */
export function maybeCleanupMastraDb(): void {
  if (process.platform !== "darwin" && process.platform !== "linux") return;

  (async () => {
    const settings = await loadSettings();
    const lastCleanup = settings.maintenance?.lastSpanCleanupAt ?? 0;
    if (Date.now() - lastCleanup < CLEANUP_INTERVAL_MS) return;

    const dbPath = getMastraDbPath();
    if (!(await fileExists(dbPath))) return;

    const cutoff = new Date(Date.now() - SPAN_RETENTION_DAYS * 86400_000).toISOString();

    try {
      const { stdout: countOut } = await execFileAsync("sqlite3", [
        dbPath,
        `SELECT COUNT(*) FROM mastra_ai_spans WHERE datetime(createdAt) < datetime('${cutoff}');`,
      ]);
      const deleteCount = parseInt(countOut.trim(), 10);
      if (deleteCount === 0) {
        await writeSettings("global", { maintenance: { lastSpanCleanupAt: Date.now() } });
        return;
      }

      console.debug(`[cleanup] deleting ${deleteCount} spans older than ${SPAN_RETENTION_DAYS} days…`);

      await execFileAsync(
        "sqlite3",
        [
          dbPath,
          `DELETE FROM mastra_ai_spans WHERE datetime(createdAt) < datetime('${cutoff}'); PRAGMA wal_checkpoint(TRUNCATE);`,
        ],
        { timeout: 120_000 },
      );

      await writeSettings("global", { maintenance: { lastSpanCleanupAt: Date.now() } });
      console.debug(`[cleanup] done, removed ${deleteCount} spans`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("no such table: mastra_ai_spans")) return;
      console.debug("[cleanup] mastra span cleanup failed:", err);
    }
  })();
}
