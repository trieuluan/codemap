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
import type { HarnessLike, HarnessMessage, HarnessThread } from "../agent/runtime/events.js";
import {
  createTree,
  appendEntry,
  branch,
  getPath,
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
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    let parentId: string | null;
    if (hasStoredData) {
      parentId = parentMap[msg.id] ?? null;
    } else {
      // First message has no parent, rest chain linearly
      parentId = i > 0 ? messages[i - 1]!.id : null;
    }
    entries.push(messageToEntry(msg, parentId));
  }

  const tree = deserializeTree(meta, entries);

  // If no stored data, set leafId to last message
  if (!hasStoredData && messages.length > 0) {
    tree.leafId = messages[messages.length - 1]!.id;
    // Persist initial metadata
    await persistTreeMeta(cwd, threadId, tree);
  }

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

  // Create new thread
  const newThread = (await harness.createThread({
    title: title ?? `Fork from ${fromThreadId.slice(0, 8)}`,
  })) as HarnessThread;

  const newThreadId = newThread.id;

  // Build new tree with the extracted path
  const newTree = createTree();
  for (const entry of pathEntries) {
    const newEntry: TreeEntry = {
      ...entry,
      id: crypto.randomUUID(), // new IDs for the new thread
      harnessMessageId: entry.harnessMessageId,
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
): Promise<void> {
  const cached = treeCache.get(threadId);
  if (!cached) return; // tree not loaded — will be rebuilt on next access

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
