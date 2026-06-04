/**
 * Pure session tree data model and algorithms.
 * Inspired by Pi.dev's SessionManager tree structure.
 *
 * Design:
 * - Every entry has `parentId: string | null` → forms a tree
 * - `leafId` pointer determines which branch is "active"
 * - `branch(entryId)` = move leafId pointer (cheap, no data copy)
 * - `getPath()` = collect entries from root → leafId for LLM context
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TreeEntryType =
  | "user"
  | "assistant"
  | "tool"
  | "system"
  | "branch_summary";

export interface TreeEntry {
  id: string;
  parentId: string | null;
  timestamp: number;
  type: TreeEntryType;
  /** Optional text content for display / summary */
  content?: string;
  /** Original harness message ID (for bridging with Mastra storage) */
  harnessMessageId?: string;
}

export interface TreeNode {
  entry: TreeEntry;
  children: TreeNode[];
  /** True if this node is on the active path (root → leafId) */
  isActive: boolean;
  /** True if this node IS the current leaf */
  isLeaf: boolean;
  /** Depth in the tree (0 = root) */
  depth: number;
}

export interface SessionTree {
  /** All entries indexed by ID */
  entries: Map<string, TreeEntry>;
  /** Current active leaf — determines which branch is "live" */
  leafId: string | null;
  /** Root entry IDs (entries with parentId === null) */
  roots: Set<string>;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createTree(): SessionTree {
  return {
    entries: new Map(),
    leafId: null,
    roots: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Mutation — append, branch, remove
// ---------------------------------------------------------------------------

/**
 * Append a new entry to the tree.
 * Sets leafId to the new entry's ID (advancing the active branch).
 */
export function appendEntry(tree: SessionTree, entry: TreeEntry): void {
  tree.entries.set(entry.id, entry);
  if (entry.parentId === null) {
    tree.roots.add(entry.id);
  }
  tree.leafId = entry.id;
}

/**
 * Move the leafId pointer to a different entry.
 * Next appended entry becomes a child of that entry.
 * This is the core branching operation — O(1), no data copy.
 */
export function branch(tree: SessionTree, entryId: string): void {
  if (!tree.entries.has(entryId)) {
    throw new Error(`Cannot branch to unknown entry: ${entryId}`);
  }
  tree.leafId = entryId;
}

/**
 * Remove a single entry from the tree.
 * Orphans any children (their parentId still points to the removed entry,
 * but they become unreachable from getPath). Use with caution.
 */
export function removeEntry(tree: SessionTree, entryId: string): void {
  const entry = tree.entries.get(entryId);
  if (!entry) return;

  tree.entries.delete(entryId);
  tree.roots.delete(entryId);

  if (tree.leafId === entryId) {
    // Move leaf to parent, or null if it was a root
    tree.leafId = entry.parentId;
  }
}

// ---------------------------------------------------------------------------
// Query — path, children, tree building
// ---------------------------------------------------------------------------

/**
 * Get the active path: root → leafId.
 * Returns entries in order from root to leaf.
 * This is what gets sent to the LLM as conversation context.
 */
export function getPath(tree: SessionTree): TreeEntry[] {
  if (!tree.leafId) return [];

  const path: TreeEntry[] = [];
  let currentId: string | null = tree.leafId;

  while (currentId) {
    const entry = tree.entries.get(currentId);
    if (!entry) break; // orphaned reference
    path.push(entry);
    currentId = entry.parentId;
  }

  path.reverse();
  return path;
}

/**
 * Get direct children of an entry, sorted by timestamp (oldest first).
 */
export function getChildren(tree: SessionTree, entryId: string): TreeEntry[] {
  const children: TreeEntry[] = [];
  for (const entry of tree.entries.values()) {
    if (entry.parentId === entryId) {
      children.push(entry);
    }
  }
  children.sort((a, b) => a.timestamp - b.timestamp);
  return children;
}

/**
 * Get all branch points — entries that have 2+ children.
 * Useful for displaying "fork" locations in the tree UI.
 */
export function getBranchPoints(tree: SessionTree): TreeEntry[] {
  const points: TreeEntry[] = [];
  for (const entry of tree.entries.values()) {
    const children = getChildren(tree, entry.id);
    if (children.length >= 2) {
      points.push(entry);
    }
  }
  points.sort((a, b) => a.timestamp - b.timestamp);
  return points;
}

/**
 * Get all leaf nodes (entries with no children).
 */
export function getLeaves(tree: SessionTree): TreeEntry[] {
  const childIds = new Set<string>();
  for (const entry of tree.entries.values()) {
    if (entry.parentId !== null) {
      childIds.add(entry.parentId);
    }
  }
  const leaves: TreeEntry[] = [];
  for (const entry of tree.entries.values()) {
    if (!childIds.has(entry.id)) {
      leaves.push(entry);
    }
  }
  leaves.sort((a, b) => a.timestamp - b.timestamp);
  return leaves;
}

/**
 * Build the full tree structure for UI rendering.
 * Returns root-level nodes with nested children.
 */
export function buildTree(
  tree: SessionTree,
  activePathIds?: Set<string>,
): TreeNode[] {
  const pathIds = activePathIds ?? getActivePathIds(tree);

  function buildNode(entry: TreeEntry, depth: number): TreeNode {
    const children = getChildren(tree, entry.id);
    return {
      entry,
      children: children.map((c) => buildNode(c, depth + 1)),
      isActive: pathIds.has(entry.id),
      isLeaf: entry.id === tree.leafId,
      depth,
    };
  }

  const roots = [...tree.roots]
    .map((id) => tree.entries.get(id))
    .filter(Boolean) as TreeEntry[];

  roots.sort((a, b) => a.timestamp - b.timestamp);
  return roots.map((r) => buildNode(r, 0));
}

/**
 * Get the set of entry IDs on the active path (root → leafId).
 */
export function getActivePathIds(tree: SessionTree): Set<string> {
  const ids = new Set<string>();
  let currentId: string | null = tree.leafId;
  while (currentId) {
    ids.add(currentId);
    const entry = tree.entries.get(currentId);
    if (!entry) break;
    currentId = entry.parentId;
  }
  return ids;
}

/**
 * Check if an entry is an ancestor of another.
 */
export function isAncestor(
  tree: SessionTree,
  ancestorId: string,
  descendantId: string,
): boolean {
  let currentId: string | null = descendantId;
  while (currentId) {
    if (currentId === ancestorId) return true;
    const entry = tree.entries.get(currentId);
    if (!entry) return false;
    currentId = entry.parentId;
  }
  return false;
}

/**
 * Find a common ancestor of two entries.
 */
export function commonAncestor(
  tree: SessionTree,
  idA: string,
  idB: string,
): string | null {
  const ancestorsA = new Set<string>();
  let currentId: string | null = idA;
  while (currentId) {
    ancestorsA.add(currentId);
    const entry = tree.entries.get(currentId);
    if (!entry) break;
    currentId = entry.parentId;
  }

  currentId = idB;
  while (currentId) {
    if (ancestorsA.has(currentId)) return currentId;
    const entry = tree.entries.get(currentId);
    if (!entry) break;
    currentId = entry.parentId;
  }
  return null;
}

/**
 * Extract a linear path from an entry to a target leaf as a new flat list.
 * Used by "fork to new thread" — extracts root→forkPoint path.
 */
export function extractPath(
  tree: SessionTree,
  leafId: string,
): TreeEntry[] {
  const path: TreeEntry[] = [];
  let currentId: string | null = leafId;
  while (currentId) {
    const entry = tree.entries.get(currentId);
    if (!entry) break;
    path.push(entry);
    currentId = entry.parentId;
  }
  path.reverse();
  return path;
}

/**
 * Generate a human-readable summary of what happened on an abandoned branch.
 * Returns a short text suitable for a BranchSummaryEntry.
 */
export function buildBranchSummary(
  tree: SessionTree,
  fromId: string,
  toId: string,
): string {
  // Collect entries on the abandoned branch (fromId → toId path)
  const abandonedPath: TreeEntry[] = [];
  let currentId: string | null = toId;
  while (currentId && currentId !== fromId) {
    const entry = tree.entries.get(currentId);
    if (!entry) break;
    abandonedPath.push(entry);
    currentId = entry.parentId;
  }

  if (abandonedPath.length === 0) return "Empty branch.";

  abandonedPath.reverse();

  const userMsgs = abandonedPath.filter((e) => e.type === "user");
  const assistantMsgs = abandonedPath.filter((e) => e.type === "assistant");
  const toolCalls = abandonedPath.filter((e) => e.type === "tool");

  const parts: string[] = [];
  if (userMsgs.length > 0) {
    parts.push(
      `${userMsgs.length} user message${userMsgs.length > 1 ? "s" : ""}`,
    );
  }
  if (assistantMsgs.length > 0) {
    parts.push(
      `${assistantMsgs.length} assistant response${assistantMsgs.length > 1 ? "s" : ""}`,
    );
  }
  if (toolCalls.length > 0) {
    parts.push(
      `${toolCalls.length} tool call${toolCalls.length > 1 ? "s" : ""}`,
    );
  }

  const summary =
    parts.length > 0 ? parts.join(", ") : `${abandonedPath.length} entries`;

  // Include first user message preview if available
  const firstUser = userMsgs[0];
  let preview = "";
  if (firstUser?.content) {
    const truncated =
      firstUser.content.length > 80
        ? firstUser.content.slice(0, 80) + "..."
        : firstUser.content;
    preview = ` — "${truncated}"`;
  }

  return `Previous branch had ${summary}.${preview}`;
}

// ---------------------------------------------------------------------------
// Serialization — for bridging with Mastra storage
// ---------------------------------------------------------------------------

/**
 * Serialize tree state to a storable metadata shape.
 * Used to persist leafId and parentId mappings alongside Mastra storage.
 */
export function serializeTreeMeta(tree: SessionTree): {
  leafId: string | null;
  parentMap: Record<string, string | null>;
} {
  const parentMap: Record<string, string | null> = {};
  for (const [id, entry] of tree.entries) {
    parentMap[id] = entry.parentId;
  }
  return { leafId: tree.leafId, parentMap };
}

/**
 * Rebuild a SessionTree from serialized metadata and entry list.
 */
export function deserializeTree(
  meta: { leafId: string | null; parentMap: Record<string, string | null> },
  entries: TreeEntry[],
): SessionTree {
  const tree = createTree();
  for (const entry of entries) {
    tree.entries.set(entry.id, entry);
    if (entry.parentId === null) {
      tree.roots.add(entry.id);
    }
  }
  tree.leafId = meta.leafId;
  return tree;
}
