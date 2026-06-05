/**
 * ActiveBranchProcessor — filters LLM context to only include messages on the
 * current active branch path. This enables "soft branching" where off-path
 * messages remain in storage but are excluded from the model's context.
 *
 * Strategy:
 * - On branch, the harness-runtime updates `activeBranchPaths` in-memory cache.
 * - The processor checks this cache first (O(1) lookup).
 * - On cold start / cache miss, reads tree metadata JSON from disk to compute
 *   active path IDs (small file, fast read).
 * - Returns filtered `MastraDBMessage[]` — the pipeline reconciles into MessageList.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { ProcessInputArgs } from "@mastra/core/processors";
import type { SessionTreeMeta } from "./session-tree-store.js";

// ---------------------------------------------------------------------------
// Module state — shared with harness-runtime
// ---------------------------------------------------------------------------

/**
 * In-memory cache of active path IDs per thread.
 * Updated by harness-runtime on branch operations.
 * Read by ActiveBranchProcessor during LLM context assembly.
 */
export const activeBranchPaths = new Map<string, Set<string>>();

// ---------------------------------------------------------------------------
// Disk-based fallback
// ---------------------------------------------------------------------------

function getTreeMetaPath(cwd: string, threadId: string): string {
  return path.join(cwd, ".codemap", "session-trees", `${threadId}.json`);
}

/**
 * Compute active path IDs from tree metadata on disk.
 * Returns null if no tree metadata exists (linear conversation, no branches).
 */
export async function loadActivePathFromDisk(
  cwd: string,
  threadId: string,
): Promise<Set<string> | null> {
  try {
    const raw = await fs.readFile(getTreeMetaPath(cwd, threadId), "utf-8");
    const meta = JSON.parse(raw) as SessionTreeMeta;
    if (!meta.leafId || !meta.parentMap || Object.keys(meta.parentMap).length === 0) {
      return null;
    }

    // No branches at all → linear conversation, no filtering needed.
    if (!meta.branches || meta.branches.length === 0) {
      return null;
    }

    // Active branch is non-main → walk parentMap from branch leaf to root.
    // This is more reliable than messageIds which can have stale entries
    // when the user navigates back via /tree and creates a new branch point.
    if (meta.activeBranch && meta.activeBranch !== "main") {
      const activeBranch = meta.branches.find((b) => b.name === meta.activeBranch);
      const startId = activeBranch?.leafId ?? meta.leafId;
      const ids = new Set<string>();
      let currentId: string | null = startId;
      while (currentId) {
        ids.add(currentId);
        const nextParent: string | null | undefined = meta.parentMap[currentId];
        if (nextParent === undefined) break;
        currentId = nextParent;
      }
      return ids.size > 0 ? ids : null;
    }

    // Active branch is "main" → filter to main thread path.
    // Walk from threadLeafId (or top-level leafId for old files) → root.
    const mainLeaf = meta.threadLeafId ?? meta.leafId;
    const ids = new Set<string>();
    let currentId: string | null = mainLeaf;
    while (currentId) {
      ids.add(currentId);
      const nextParent: string | null | undefined = meta.parentMap[currentId];
      if (nextParent === undefined) break;
      currentId = nextParent;
    }
    return ids.size > 0 ? ids : null;
  } catch {
    return null; // no tree metadata → linear conversation
  }
}

// ---------------------------------------------------------------------------
// ActiveBranchProcessor
// ---------------------------------------------------------------------------

/**
 * Mastra input processor that filters messages to only those on the active
 * branch path. Runs AFTER MessageHistory loads messages from storage.
 *
 * Returns `MastraDBMessage[]` — the pipeline reconciles into MessageList via
 * `applyMessagesToMessageList()` which removes missing IDs and re-adds filtered ones.
 */
export class ActiveBranchProcessor {
  readonly id = "active-branch-filter";
  readonly name = "Active Branch Filter";

  async processInput(args: ProcessInputArgs): Promise<typeof args.messages> {
    const { messages, requestContext } = args;

    // Get threadId from request context
    const memoryContext = requestContext?.get?.("MastraMemory") as
      | { threadId?: string }
      | undefined;
    const threadId = memoryContext?.threadId;
    if (!threadId) return messages;

    // Check in-memory cache first
    let activeIds = activeBranchPaths.get(threadId);

    // Fallback: read tree metadata from disk
    if (!activeIds) {
      try {
        const { readWorkspacePath } = await import(
          "@codemap/core/lib/workspace-project.js"
        );
        const cwd = await readWorkspacePath();
        activeIds = (await loadActivePathFromDisk(cwd, threadId)) ?? undefined;
        if (activeIds) {
          // Cache for subsequent calls
          activeBranchPaths.set(threadId, activeIds);
        }
      } catch {
        // Can't read workspace — skip filtering
        return messages;
      }
    }

    // No active branch → linear conversation, return all messages
    if (!activeIds || activeIds.size === 0) return messages;

    // Filter: keep only messages on the active path
    const filtered = messages.filter((m) => activeIds.has(m.id));

    // If filtering removed everything (shouldn't happen), return original
    return filtered.length > 0 ? filtered : messages;
  }
}
