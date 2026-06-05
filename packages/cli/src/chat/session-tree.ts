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

export interface BranchMeta {
  /** Unique branch name (e.g. "main", "branch-1") */
  name: string;
  /** Leaf entry ID for this branch */
  leafId: string;
  /** When the branch was created */
  createdAt: number;
  /** Whether this is the currently active branch */
  isActive: boolean;
  /** Last activity timestamp (from leaf entry) */
  updatedAt: number;
  /** Content preview of the leaf entry */
  content?: string;
  /** Ordered list of message IDs on this branch (root → leaf).
   *  Used by loadActivePathFromDisk instead of walking parentMap. */
  messageIds: string[];
}

export interface SessionTree {
  /** All entries indexed by ID */
  entries: Map<string, TreeEntry>;
  /** Current active leaf — determines which branch is "live" */
  leafId: string | null;
  /** Main thread's last entry — always tracks the main path, even when on a branch */
  threadLeafId: string | null;
  /** Root entry IDs (entries with parentId === null) */
  roots: Set<string>;
  /** Named branches (like git branches) */
  branches: BranchMeta[];
  /** Currently active branch name */
  activeBranch: string | null;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export function createTree(): SessionTree {
  return {
    entries: new Map(),
    leafId: null,
    threadLeafId: null,
    roots: new Set(),
    branches: [],
    activeBranch: null,
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
// Branch management — named branches like git
// ---------------------------------------------------------------------------

/**
 * Get all branches.
 */
/**
 * Find the last user entry on the path from leafId → root.
 * Used for branch preview — shows what the user said, not the assistant's response.
 */
function findLastUserEntry(tree: SessionTree, leafId: string | null): TreeEntry | undefined {
  let cur = leafId;
  while (cur) {
    const entry = tree.entries.get(cur);
    if (!entry) break;
    if (entry.type === "user") return entry;
    cur = entry.parentId;
  }
  return undefined;
}

export function getBranches(tree: SessionTree): BranchMeta[] {
  // Synthesize "main" on-the-fly — represents the whole thread, not persisted
  const mainLeafId = tree.threadLeafId ?? tree.leafId ?? [...tree.entries.keys()].pop() ?? null;
  const mainLeaf = mainLeafId ? tree.entries.get(mainLeafId) : undefined;
  const mainUser = findLastUserEntry(tree, mainLeafId);
  const main: BranchMeta = {
    name: "main",
    leafId: mainLeafId ?? "",
    createdAt: 0,
    isActive: tree.activeBranch === "main" || !tree.activeBranch,
    updatedAt: mainLeaf?.timestamp ?? 0,
    messageIds: [],
    content: mainUser?.content,
  };

  const others = tree.branches.map((b) => {
    const leafEntry = tree.entries.get(b.leafId);
    const branchUser = findLastUserEntry(tree, b.leafId);
    return {
      ...b,
      isActive: b.name === tree.activeBranch,
      updatedAt: leafEntry?.timestamp ?? b.updatedAt ?? b.createdAt,
      content: branchUser?.content,
    };
  });

  return [main, ...others];
}

/**
 * Create a new named branch pointing at the given leafId.
 * If a branch with this name already exists, updates its leafId.
 */
export function createBranch(
  tree: SessionTree,
  name: string,
  leafId: string,
): BranchMeta {
  // Compute messageIds by walking leafId → root, then reversing
  const ids: string[] = [];
  let cur: string | null = leafId;
  while (cur) {
    ids.push(cur);
    const entry = tree.entries.get(cur);
    cur = entry?.parentId ?? null;
  }
  ids.reverse();

  const existing = tree.branches.find((b) => b.name === name);
  if (existing) {
    existing.leafId = leafId;
    existing.updatedAt = Date.now();
    existing.messageIds = ids;
    return existing;
  }
  const branch: BranchMeta = { name, leafId, createdAt: Date.now(), isActive: false, updatedAt: Date.now(), messageIds: ids };
  tree.branches.push(branch);
  return branch;
}

/**
 * Delete a named branch. Cannot delete "main".
 * Returns true if deleted, false if not found or is "main".
 */
export function deleteBranch(tree: SessionTree, name: string): boolean {
  if (name === "main") return false;
  const idx = tree.branches.findIndex((b) => b.name === name);
  if (idx < 0) return false;
  tree.branches.splice(idx, 1);
  if (tree.activeBranch === name) {
    tree.activeBranch = "main";
    tree.leafId = tree.threadLeafId;
  }
  return true;
}

/**
 * Get the active branch name.
 */
export function getActiveBranchName(tree: SessionTree): string | null {
  return tree.activeBranch;
}

/**
 * Set the active branch by name. Moves leafId to the branch's leafId.
 * Returns true if switched, false if branch not found.
 */
export function setActiveBranch(tree: SessionTree, name: string): boolean {
  // "main" is symbolic — not in tree.branches
  if (name === "main") {
    tree.activeBranch = "main";
    tree.leafId = tree.threadLeafId;
    return true;
  }
  const branchMeta = tree.branches.find((b) => b.name === name);
  if (!branchMeta) return false;
  tree.activeBranch = name;
  tree.leafId = branchMeta.leafId;
  return true;
}

/**
 * Auto-generate the next branch name.
 * Returns "main" if no branches exist, otherwise "branch-{N}".
 */
export function nextBranchName(tree: SessionTree): string {
  const existing = new Set(tree.branches.map((b) => b.name));
  let n = 1;
  while (existing.has(`branch-${n}`)) n++;
  return `branch-${n}`;
}

/**
 * Get message IDs on a specific branch's path (leafId → root).
 */
export function getBranchPathIds(tree: SessionTree, branchName: string): Set<string> {
  const branchMeta = tree.branches.find((b) => b.name === branchName);
  if (!branchMeta) return new Set();
  const ids = new Set<string>();
  let currentId: string | null = branchMeta.leafId;
  while (currentId) {
    ids.add(currentId);
    const entry = tree.entries.get(currentId);
    if (!entry) break;
    currentId = entry.parentId;
  }
  return ids;
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
  threadLeafId: string | null;
  parentMap: Record<string, string | null>;
  branches: BranchMeta[];
  activeBranch: string | null;
} {
  const parentMap: Record<string, string | null> = {};
  for (const [id, entry] of tree.entries) {
    parentMap[id] = entry.parentId;
  }
  return {
    leafId: tree.leafId,
    threadLeafId: tree.threadLeafId,
    parentMap,
    branches: tree.branches,
    activeBranch: tree.activeBranch,
  };
}

/**
 * Rebuild a SessionTree from serialized metadata and entry list.
 */
export function deserializeTree(
  meta: {
    leafId: string | null;
    threadLeafId?: string | null;
    parentMap: Record<string, string | null>;
    branches?: BranchMeta[];
    activeBranch?: string | null;
  },
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
  // Compute threadLeafId: prefer stored value, else walk from last root to leaf
  if (meta.threadLeafId) {
    tree.threadLeafId = meta.threadLeafId;
  } else {
    const lastRoot = [...tree.roots].pop();
    if (lastRoot) {
      let cur = lastRoot;
      while (true) {
        const children = [...tree.entries.values()].filter((e) => e.parentId === cur);
        if (children.length === 0) break;
        cur = children[0].id; // first child = main thread path
      }
      tree.threadLeafId = cur;
    }
  }
  tree.branches = meta.branches ?? [];
  tree.activeBranch = meta.activeBranch ?? null;
  return tree;
}
