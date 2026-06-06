import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";

function findGitRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const LOG_DIR = join(findGitRoot(), ".codemap", "debug-logs");

function ensureDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

export function createDebugLogger() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logFile = join(LOG_DIR, `chat-${timestamp}.jsonl`);
  let requestIdx = 0;

  ensureDir();

  function write(entry: Record<string, unknown>) {
    appendFileSync(
      logFile,
      JSON.stringify(sanitizeForLog({ ...entry, ts: new Date().toISOString() })) + "\n",
    );
  }

  return {
    logFile,
    logStreamRequest(info: {
      model: string;
      messageCount: number;
      toolCount: number;
      hasSystem: boolean;
      toolsCalled?: number;
      baseUrl?: string;
    }) {
      write({ type: "stream_request", req: requestIdx++, ...info });
    },
    logChunk(chunkIdx: number, info: Record<string, unknown>) {
      write({ type: "chunk", req: requestIdx - 1, chunkIdx, ...info });
    },
    logToolStart(name: string, args: string, id: string) {
      write({ type: "tool_start", name, id: id, args: args.slice(0, 500) });
    },
    logToolResult(name: string, result: string) {
      write({ type: "tool_result", name, result: result.slice(0, 500) });
    },
    logToolFallback(reason: string) {
      write({ type: "tool_fallback", reason });
    },
    logError(err: unknown) {
      const entry: Record<string, unknown> = {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      if (err instanceof Error && err.stack) {
        entry.stack = err.stack.split("\n").slice(0, 5).join("\n");
      }
      if (err instanceof Error && "cause" in err && err.cause) {
        entry.cause = String(err.cause);
      }
      write(entry);
    },
    logSummary(info: {
      totalChunks: number;
      textChunks: number;
      toolCallChunks: number;
      finalToolCalls: string[];
      model: string;
    }) {
      write({ type: "summary", ...info });
    },
    logDebugInfo(info: Record<string, unknown>) {
      write({ type: "debug_info", ...info });
    },
  };
}

export type DebugLogger = ReturnType<typeof createDebugLogger>;

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 1_000 ? `${value.slice(0, 1_000)}…[truncated ${value.length}]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (depth >= 4) return `[array ${value.length}]`;
    return value.slice(0, 50).map((item) => sanitizeForLog(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth >= 4) return "[object]";
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      out[key] = sanitizeForLog(item, depth + 1);
    }
    return out;
  }
  return String(value);
}
