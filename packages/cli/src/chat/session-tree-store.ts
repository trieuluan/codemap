/**
 * Session tree storage adapter — bridges SessionTree with Mastra thread storage.
 *
 * Strategy:
 * - Tree metadata (leafId, parentMap) persisted as JSON in .codemap/session-trees/{threadId}.json
 * - SessionTree rebuilt from harness messages + stored metadata on load
 * - In-memory cache avoids re-reading on every access
 * - Auto-saves after mutation operations (branch, append, fork)
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { HarnessLike, HarnessMessage } from "../agent/runtime/events.js";
import {
  createTree,
  appendEntry,
  branch,
  getPath,
  getActivePathIds,
  buildTree,
  extractPath,
  buildBranchSummary,
  serializeTreeMeta,
  deserializeTree,
  type SessionTree,
  type TreeEntry,
  type TreeNode,
  type TreeEntryType,
} from "./session-tree.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionTreeMeta {
  leafId: string | null;
  parentMap: Record<string, string | null>;
}

interface TreeCacheEntry {
  tree: SessionTree;
  loadedAt: number;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const treeCache = new Map<string, TreeCacheEntry>();

// ---------------------------------------------------------------------------
// Storage path helpers
// ---------------------------------------------------------------------------

function getSessionTreesDir(cwd: string): string {
  return path.join(cwd, ".codemap", "session-trees");
}

function getTreeMetaPath(cwd: string, threadId: string): string {
  return path.join(getSessionTreesDir(cwd), `${threadId}.json`);
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function loadTreeMeta(
  cwd: string,
  threadId: string,
): Promise<SessionTreeMeta> {
  try {
    const raw = await fs.readFile(getTreeMetaPath(cwd, threadId), "utf-8");
    const parsed = JSON.parse(raw) as SessionTreeMeta;
    return {
      leafId: parsed.leafId ?? null,
      parentMap: parsed.parentMap ?? {},
    };
  } catch {
    return { leafId: null, parentMap: {} };
  }
}

async function saveTreeMeta(
  cwd: string,
  threadId: string,
  meta: SessionTreeMeta,
): Promise<void> {
  await ensureDir(getSessionTreesDir(cwd));
  await fs.writeFile(
    getTreeMetaPath(cwd, threadId),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Message → TreeEntry conversion
// ---------------------------------------------------------------------------

function messageToEntry(
  msg: HarnessMessage,
  parentId: string | null,
): TreeEntry {
  let type: TreeEntryType = "user";
  if (msg.role === "assistant") type = "assistant";
  else if (msg.role === "system") type = "system";

  // Extract text content for preview
  const textParts = msg.content.filter(
    (c: HarnessMessage["content"][number]) => c.type === "text",
  );
  const content =
    textParts.length > 0
      ? textParts
          .map((c: HarnessMessage["content"][number]) => (c as { type: "text"; text: string }).text)
          .join("\n")
      : undefined;

  return {
    id: msg.id,
    parentId,
    timestamp: msg.createdAt.getTime(),
    type,
    content,
    harnessMessageId: msg.id,
  };
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Load or build a SessionTree for a thread.
 * Reads stored metadata, fetches messages from harness, and reconstructs the tree.
 */
export async function loadThreadTree(
  harness: HarnessLike,
  threadId: string,
  cwd: string,
): Promise<SessionTree> {
  // Check cache
  const cached = treeCache.get(threadId);
  if (cached) return cached.tree;

  // Load metadata and messages
  const [meta, messages] = await Promise.all([
    loadTreeMeta(cwd, threadId),
    harness.listMessagesForThread({ threadId }),
  ]);

  // If no stored parentMap, create one from linear message order
  const parentMap = meta.parentMap;
  const hasStoredData = Object.keys(parentMap).length > 0;

  const entries: TreeEntry[] = [];
  // Track the previous entry ID for linear fallback when a message
  // is not in the parentMap (e.g. new messages after branch cleanup).
  let prevEntryId: string | null = null;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    let parentId: string | null;
    if (hasStoredData) {
      // Use stored parent if available, otherwise fall back to previous message
      parentId = parentMap[msg.id] ?? prevEntryId ?? null;
    } else {
      // First message has no parent, rest chain linearly
      parentId = i > 0 ? messages[i - 1]!.id : null;
    }
    entries.push(messageToEntry(msg, parentId));
    prevEntryId = msg.id;
  }

  const tree = deserializeTree(meta, entries);

  // If no stored data, leave leafId as null.
  // Active path is only computed once a real mutation (fork/branch/recordMessage)
  // has set a leafId — until then the picker shows all messages with no active
  // highlight, which is the correct UX before any branch has occurred.

  treeCache.set(threadId, { tree, loadedAt: Date.now() });
  return tree;
}

/**
 * Persist tree metadata to disk.
 */
async function persistTreeMeta(
  cwd: string,
  threadId: string,
  tree: SessionTree,
): Promise<void> {
  const meta = serializeTreeMeta(tree);
  await saveTreeMeta(cwd, threadId, meta);
}

/**
 * Invalidate the in-memory cache for a thread.
 */
export function invalidateTreeCache(threadId: string): void {
  treeCache.delete(threadId);
}

/**
 * Clear all cached trees (e.g., on workspace change).
 */
export function clearTreeCache(): void {
  treeCache.clear();
}

// ---------------------------------------------------------------------------
// High-level operations (used by harness-runtime and slash commands)
// ---------------------------------------------------------------------------

/**
 * Branch the active conversation to a different point in the tree.
 * Next message appended will be a child of `entryId`.
 */
export async function branchThread(
  harness: HarnessLike,
  threadId: string,
  entryId: string,
  cwd: string,
): Promise<void> {
  const tree = await loadThreadTree(harness, threadId, cwd);
  branch(tree, entryId);
  await persistTreeMeta(cwd, threadId, tree);
}

/**
 * Fork: create a new thread from a branch point.
 * Copies the root→entryId path as messages in the new thread.
 * Returns the new thread ID.
 */
export async function forkThread(
  harness: HarnessLike,
  fromThreadId: string,
  fromEntryId: string | undefined,
  title: string | undefined,
  cwd: string,
): Promise<string> {
  const tree = await loadThreadTree(harness, fromThreadId, cwd);

  // Determine fork point
  const forkPointId = fromEntryId ?? tree.leafId;
  if (!forkPointId) {
    throw new Error("Cannot fork: no entries in source thread");
  }

  // Extract the path from root → fork point
  const pathEntries = extractPath(tree, forkPointId);

  // If the fork point is a user message, also include the next assistant
  // response (if any) so the fork preserves the full turn — tools, thinking,
  // and all assistant content that was generated for that user message.
  const lastEntry = pathEntries[pathEntries.length - 1];
  if (lastEntry && lastEntry.type === "user") {
    const nextEntries = Array.from(tree.entries.values())
      .filter((e) => e.parentId === lastEntry.id)
      .sort((a, b) => a.timestamp - b.timestamp);
    for (const next of nextEntries) {
      if (!pathEntries.some((p) => p.id === next.id)) {
        pathEntries.push(next);
      }
    }
  }

  // Collect source message IDs on the active path
  const sourceMsgIds = pathEntries
    .map((e) => e.harnessMessageId)
    .filter((id): id is string => !!id);

  // Clone thread with only the active-path messages via memory API
  const memory = await harness.getResolvedMemory?.();
  if (!memory) {
    throw new Error("Cannot fork: memory not available");
  }

  // Guard: if no harnessMessageIds resolved, we'd clone ALL source messages.
  // Refuse instead of risking an unbounded clone + embedding spike.
  if (sourceMsgIds.length === 0) {
    throw new Error("Cannot fork: no harness message IDs on the selected path");
  }

  const threadTitle = title ?? `Fork from ${fromThreadId.slice(0, 8)}`;
  const { thread: newThread, clonedMessages } = await memory.cloneThread(
    {
      sourceThreadId: fromThreadId,
      title: threadTitle,
      options: { messageFilter: { messageIds: sourceMsgIds } },
    },
    // Skip expensive fastembed ONNX embedding during clone — embeddings will
    // be created lazily when the user interacts with the new thread.
    { semanticRecall: false },
  );
  const newThreadId = newThread.id;

  // Build new tree with the extracted path, mapping to cloned message IDs.
  // Use cloned message IDs as entry IDs so that the persisted parentMap keys
  // match the harness message IDs that loadThreadTree uses for parent lookups.
  const newTree = createTree();
  for (let i = 0; i < pathEntries.length; i++) {
    const entry = pathEntries[i]!;
    const clonedMsg = clonedMessages[i]; // cloned in same order as source
    const newId = clonedMsg?.id ?? crypto.randomUUID();
    const newEntry: TreeEntry = {
      id: newId,
      parentId: i === 0 ? null : (clonedMessages[i - 1]?.id ?? pathEntries[i - 1]!.id),
      timestamp: entry.timestamp,
      type: entry.type,
      content: entry.content,
      harnessMessageId: clonedMsg?.id ?? entry.harnessMessageId,
    };
    appendEntry(newTree, newEntry);
  }

  // Persist new tree
  await persistTreeMeta(cwd, newThreadId, newTree);

  return newThreadId;
}

/**
 * Record a new message in the tree (called after message append).
 * Links the new message to the current leafId.
 */
export async function recordMessage(
  threadId: string,
  messageId: string,
  type: TreeEntryType,
  content: string | undefined,
  cwd: string,
  harness?: HarnessLike,
): Promise<void> {
  let cached = treeCache.get(threadId);
  if (!cached) {
    // Tree not cached (e.g. after branch cleanup) — reload to get correct parent chain
    if (!harness) return;
    await loadThreadTree(harness, threadId, cwd);
    cached = treeCache.get(threadId);
    if (!cached) return;
  }

  const tree = cached.tree;
  const entry: TreeEntry = {
    id: messageId,
    parentId: tree.leafId,
    timestamp: Date.now(),
    type,
    content,
    harnessMessageId: messageId,
  };
  appendEntry(tree, entry);
  await persistTreeMeta(cwd, threadId, tree);
}

/**
 * Delete harness messages that are NOT on the active tree path after branching.
 * This mirrors pi.dev's behavior: all entries remain in the session file,
 * but only active-path messages exist in the harness after a branch.
 */
export async function deleteOffPathMessages(
  harness: HarnessLike,
  threadId: string,
  cwd: string,
): Promise<number> {
  const tree = await loadThreadTree(harness, threadId, cwd);
  const activeIds = getActivePathIds(tree);

  const offPathIds: Array<{ id: string }> = [];
  for (const [id] of tree.entries) {
    if (!activeIds.has(id)) {
      offPathIds.push({ id });
    }
  }

  if (offPathIds.length === 0) return 0;

  const memory = await harness.getResolvedMemory?.();
  if (!memory) return 0;

  await memory.deleteMessages(offPathIds);

  // Clear cache so the tree is rebuilt from harness on next access
  treeCache.delete(threadId);

  return offPathIds.length;
}

/**
 * Generate a branch summary for display in context.
 */
export async function getBranchSummary(
  harness: HarnessLike,
  threadId: string,
  fromEntryId: string,
  toEntryId: string,
  cwd: string,
): Promise<string> {
  const tree = await loadThreadTree(harness, threadId, cwd);
  return buildBranchSummary(tree, fromEntryId, toEntryId);
}

/**
 * Get the active path (root → leafId) as TreeEntry list.
 */
export async function getActivePath(
  harness: HarnessLike,
  threadId: string,
  cwd: string,
): Promise<TreeEntry[]> {
  const tree = await loadThreadTree(harness, threadId, cwd);
  return getPath(tree);
}

/**
 * Get the tree structure for UI rendering.
 */
export async function getTreeForUI(
  harness: HarnessLike,
  threadId: string,
  cwd: string,
): Promise<TreeNode[]> {
  const tree = await loadThreadTree(harness, threadId, cwd);
  return buildTree(tree);
}

/**
 * Get the current leaf entry ID for a thread.
 */
export async function getLeafId(
  harness: HarnessLike,
  threadId: string,
  cwd: string,
): Promise<string | null> {
  const tree = await loadThreadTree(harness, threadId, cwd);
  return tree.leafId;
}
