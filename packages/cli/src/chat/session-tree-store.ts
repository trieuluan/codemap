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
  threadLeafId?: string | null;
  parentMap: Record<string, string | null>;
  branches?: import("./session-tree.js").BranchMeta[];
  activeBranch?: string | null;
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
      threadLeafId: parsed.threadLeafId ?? null,
      parentMap: parsed.parentMap ?? {},
      branches: parsed.branches ?? [],
      activeBranch: parsed.activeBranch ?? null,
    };
  } catch {
    return { leafId: null, parentMap: {}, branches: [], activeBranch: null };
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

function stripThinkTags(text: string): string {
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think\b[^>]*\/?>/gi, "")
    .replace(/<\/think>/gi, "")
    .trim();
}

export function extractTaskContent(raw: string): string {
  const match = raw.match(/<task>\n([\s\S]*?)\n<\/task>/);
  return match?.[1]?.trim() ?? raw.trim();
}

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
  const rawContent =
    textParts.length > 0
      ? textParts
          .map((c: HarnessMessage["content"][number]) => (c as { type: "text"; text: string }).text)
          .join("\n")
      : undefined;
  const content = rawContent
    ? stripThinkTags(extractTaskContent(rawContent)) || undefined
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
  const [meta, rawMessages] = await Promise.all([
    loadTreeMeta(cwd, threadId),
    harness.listMessagesForThread({ threadId }),
  ]);

  // Filter orphan trailing user message: if the last message is a user message
  // with no assistant response after it, it was likely from a Ctrl+C cancel.
  // Remove it to prevent duplicate/stale messages on session restore.
  const messages = [...rawMessages];
  if (messages.length >= 1 && messages[messages.length - 1]?.role === "user") {
    messages.pop();
  }

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

  // Main branch is symbolic (whole thread) — synthesized on-the-fly in getBranches(), not persisted.
  // activeBranch defaults to "main" when no specific branch is selected.

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
 * Auto-creates a new named branch.
 * Returns the new branch name.
 */
export async function branchThread(
  harness: HarnessLike,
  threadId: string,
  entryId: string,
  cwd: string,
  turnEntryId?: string,
  customName?: string,
): Promise<string> {
  const { createBranch, nextBranchName } = await import("./session-tree.js");
  const tree = await loadThreadTree(harness, threadId, cwd);

  // entryId is the parent (branchTarget) — set as tree leaf for appending
  branch(tree, entryId);

  // Compute full turn from turnEntryId (user message) if provided.
  // This includes assistant responses, tool calls, and tool results
  // so the branch has the complete conversation turn.
  let branchLeafId = entryId;
  if (turnEntryId && tree.entries.has(turnEntryId)) {
    const turnIds: string[] = [];
    const queue: string[] = [turnEntryId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      turnIds.push(cur);
      const children = Array.from(tree.entries.values())
        .filter((e) => e.parentId === cur)
        .sort((a, b) => a.timestamp - b.timestamp);
      for (const child of children) {
        if (child.type === "user") continue; // stop at next user turn
        queue.push(child.id);
      }
    }
    // Branch leaf = last entry of the turn (new messages append after turn)
    if (turnIds.length > 0) {
      branchLeafId = turnIds[turnIds.length - 1];
    }
  }

  // Auto-create branch with leaf at turn end (includes full turn in messageIds)
  const branchName = customName?.trim() || nextBranchName(tree);
  createBranch(tree, branchName, branchLeafId);
  tree.activeBranch = branchName;

  await persistTreeMeta(cwd, threadId, tree);
  return branchName;
}

/**
 * Switch to a named branch. Moves leafId to the branch's leafId.
 * Returns the branch leafId if switched, null if branch not found.
 */
export async function switchBranch(
  harness: HarnessLike,
  threadId: string,
  branchName: string,
  cwd: string,
): Promise<string | null> {
  const { setActiveBranch } = await import("./session-tree.js");
  const tree = await loadThreadTree(harness, threadId, cwd);
  if (!setActiveBranch(tree, branchName)) return null;
  await persistTreeMeta(cwd, threadId, tree);
  return tree.leafId;
}

/**
 * Delete a named branch. Cannot delete "main".
 * If deleting the active branch, switches to "main" first.
 * Returns true if deleted.
 */
export async function deleteBranchFromStore(
  harness: HarnessLike,
  threadId: string,
  branchName: string,
  cwd: string,
): Promise<boolean> {
  const { deleteBranch: deleteBranchCore } = await import("./session-tree.js");
  const tree = await loadThreadTree(harness, threadId, cwd);
  if (!deleteBranchCore(tree, branchName)) return false;
  await persistTreeMeta(cwd, threadId, tree);
  return true;
}

/**
 * Get all branches for a thread.
 */
export async function getBranchesFromStore(
  harness: HarnessLike,
  threadId: string,
  cwd: string,
): Promise<import("./session-tree.js").BranchMeta[]> {
  const { getBranches } = await import("./session-tree.js");
  const tree = await loadThreadTree(harness, threadId, cwd);
  return getBranches(tree);
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

  // If the fork point is a user message, include the ENTIRE turn:
  // all descendants until the next user message (or end of tree).
  // This captures assistant responses, tool calls, tool results, thinking, etc.
  const lastEntry = pathEntries[pathEntries.length - 1];
  if (lastEntry && lastEntry.type === "user") {
    // BFS from user message, stop at next user message boundary
    const queue: string[] = [lastEntry.id];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = Array.from(tree.entries.values())
        .filter((e) => e.parentId === currentId)
        .sort((a, b) => a.timestamp - b.timestamp);
      for (const child of children) {
        if (child.type === "user") continue; // stop at next user turn
        if (!pathEntries.some((p) => p.id === child.id)) {
          pathEntries.push(child);
          queue.push(child.id);
        }
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

  // Main is symbolic — not persisted, synthesized on-the-fly in getBranches()
  newTree.activeBranch = "main";

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

  // Update active branch's leafId and messageIds (skip for main — it's the whole thread)
  if (tree.activeBranch && tree.activeBranch !== "main") {
    const activeBranch = tree.branches.find((b) => b.name === tree.activeBranch);
    if (activeBranch) {
      activeBranch.leafId = messageId;
      activeBranch.messageIds.push(messageId);
      activeBranch.updatedAt = Date.now();
    }
  }
  // Update threadLeafId only when on main thread (messages go to main path)
  if (!tree.activeBranch || tree.activeBranch === "main") {
    tree.threadLeafId = messageId;
  }

  await persistTreeMeta(cwd, threadId, tree);

  // Update in-memory active path cache so ActiveBranchProcessor
  // sees the new message on the next LLM call.
  // Skip for main branch (whole thread, no filtering needed).
  try {
    const { activeBranchPaths } = await import("./active-branch-processor.js");
    if (tree.activeBranch === "main") {
      activeBranchPaths.delete(threadId);
    } else {
      const activeIds = getActivePathIds(tree);
      if (activeIds.size > 0) {
        activeBranchPaths.set(threadId, activeIds);
      }
    }
  } catch {
    // non-fatal
  }
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
