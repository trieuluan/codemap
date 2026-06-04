import assert from "node:assert/strict";
import test from "node:test";
import {
  createTree,
  appendEntry,
  branch,
  removeEntry,
  getPath,
  getChildren,
  getBranchPoints,
  getLeaves,
  buildTree,
  getActivePathIds,
  isAncestor,
  commonAncestor,
  extractPath,
  buildBranchSummary,
  serializeTreeMeta,
  deserializeTree,
  type TreeEntry,
} from "./session-tree.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function mkEntry(
  overrides: Partial<TreeEntry> & { parentId?: string | null },
): TreeEntry {
  const id = overrides.id ?? `entry-${++idCounter}`;
  return {
    id,
    parentId: null,
    timestamp: Date.now(),
    type: "user",
    ...overrides,
  };
}

function resetIdCounter() {
  idCounter = 0;
}

// ---------------------------------------------------------------------------
// createTree
// ---------------------------------------------------------------------------

test("createTree returns empty tree", () => {
  const tree = createTree();
  assert.equal(tree.entries.size, 0);
  assert.equal(tree.leafId, null);
  assert.equal(tree.roots.size, 0);
});

// ---------------------------------------------------------------------------
// appendEntry
// ---------------------------------------------------------------------------

test("appendEntry adds entry and sets leafId", () => {
  resetIdCounter();
  const tree = createTree();
  const entry = mkEntry({ parentId: null });

  appendEntry(tree, entry);

  assert.equal(tree.entries.size, 1);
  assert.equal(tree.leafId, entry.id);
  assert.ok(tree.roots.has(entry.id));
});

test("appendEntry chains entries via parentId", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null });
  const e2 = mkEntry({ parentId: e1.id });
  const e3 = mkEntry({ parentId: e2.id });

  appendEntry(tree, e1);
  appendEntry(tree, e2);
  appendEntry(tree, e3);

  assert.equal(tree.leafId, e3.id);
  assert.equal(tree.entries.size, 3);
  // Only e1 is a root
  assert.equal(tree.roots.size, 1);
  assert.ok(tree.roots.has(e1.id));
});

// ---------------------------------------------------------------------------
// branch
// ---------------------------------------------------------------------------

test("branch moves leafId pointer", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null });
  const e2 = mkEntry({ parentId: e1.id });

  appendEntry(tree, e1);
  appendEntry(tree, e2);
  assert.equal(tree.leafId, e2.id);

  branch(tree, e1.id);
  assert.equal(tree.leafId, e1.id);
});

test("branch throws for unknown entry", () => {
  const tree = createTree();
  assert.throws(() => branch(tree, "nonexistent"), /Cannot branch to unknown entry/);
});

test("branch then append creates a fork", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null, type: "user" });
  const e2 = mkEntry({ parentId: e1.id, type: "assistant" });

  appendEntry(tree, e1);
  appendEntry(tree, e2);

  // Branch back to e1
  branch(tree, e1.id);

  // Append new entry — becomes sibling of e2
  const e3 = mkEntry({ parentId: e1.id, type: "user" });
  appendEntry(tree, e3);

  assert.equal(tree.leafId, e3.id);
  assert.equal(tree.entries.size, 3);

  // e1 should have 2 children (e2, e3)
  const children = getChildren(tree, e1.id);
  assert.equal(children.length, 2);
});

// ---------------------------------------------------------------------------
// removeEntry
// ---------------------------------------------------------------------------

test("removeEntry removes entry and updates leafId", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null });
  const e2 = mkEntry({ parentId: e1.id });

  appendEntry(tree, e1);
  appendEntry(tree, e2);

  removeEntry(tree, e2.id);

  assert.equal(tree.entries.size, 1);
  assert.equal(tree.leafId, e1.id);
});

test("removeEntry on root clears leafId to null", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null });

  appendEntry(tree, e1);
  removeEntry(tree, e1.id);

  assert.equal(tree.entries.size, 0);
  assert.equal(tree.leafId, null);
});

test("removeEntry on nonexistent is no-op", () => {
  const tree = createTree();
  removeEntry(tree, "nonexistent"); // should not throw
  assert.equal(tree.entries.size, 0);
});

// ---------------------------------------------------------------------------
// getPath
// ---------------------------------------------------------------------------

test("getPath returns root → leaf path", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null, type: "user" });
  const e2 = mkEntry({ parentId: e1.id, type: "assistant" });
  const e3 = mkEntry({ parentId: e2.id, type: "user" });

  appendEntry(tree, e1);
  appendEntry(tree, e2);
  appendEntry(tree, e3);

  const path = getPath(tree);
  assert.equal(path.length, 3);
  assert.equal(path[0].id, e1.id);
  assert.equal(path[1].id, e2.id);
  assert.equal(path[2].id, e3.id);
});

test("getPath returns empty for empty tree", () => {
  const tree = createTree();
  assert.deepEqual(getPath(tree), []);
});

test("getPath follows active branch after fork", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null, type: "user" });
  const e2 = mkEntry({ parentId: e1.id, type: "assistant" });
  const e3 = mkEntry({ parentId: e1.id, type: "user" }); // fork

  appendEntry(tree, e1);
  appendEntry(tree, e2);

  // Branch back and take different path
  branch(tree, e1.id);
  appendEntry(tree, e3);

  const path = getPath(tree);
  assert.equal(path.length, 2);
  assert.equal(path[0].id, e1.id);
  assert.equal(path[1].id, e3.id);
});

// ---------------------------------------------------------------------------
// getChildren
// ---------------------------------------------------------------------------

test("getChildren returns direct children sorted by timestamp", () => {
  const tree = createTree();
  const root = mkEntry({ id: "root", parentId: null, timestamp: 100 });
  const c1 = mkEntry({ id: "c1", parentId: "root", timestamp: 300 });
  const c2 = mkEntry({ id: "c2", parentId: "root", timestamp: 200 });

  appendEntry(tree, root);
  appendEntry(tree, c1);
  appendEntry(tree, c2);

  const children = getChildren(tree, "root");
  assert.equal(children.length, 2);
  assert.equal(children[0].id, "c2"); // 200 < 300
  assert.equal(children[1].id, "c1");
});

test("getChildren returns empty for leaf node", () => {
  const tree = createTree();
  const e1 = mkEntry({ id: "leaf", parentId: null });
  appendEntry(tree, e1);

  assert.deepEqual(getChildren(tree, "leaf"), []);
});

// ---------------------------------------------------------------------------
// getBranchPoints
// ---------------------------------------------------------------------------

test("getBranchPoints finds fork entries", () => {
  const tree = createTree();
  const root = mkEntry({ id: "root", parentId: null, timestamp: 100 });
  const c1 = mkEntry({ id: "c1", parentId: "root", timestamp: 200 });
  const c2 = mkEntry({ id: "c2", parentId: "root", timestamp: 300 });

  appendEntry(tree, root);
  appendEntry(tree, c1);
  branch(tree, root.id);
  appendEntry(tree, c2);

  const points = getBranchPoints(tree);
  assert.equal(points.length, 1);
  assert.equal(points[0].id, "root");
});

// ---------------------------------------------------------------------------
// getLeaves
// ---------------------------------------------------------------------------

test("getLeaves returns nodes with no children", () => {
  const tree = createTree();
  const root = mkEntry({ id: "root", parentId: null, timestamp: 100 });
  const c1 = mkEntry({ id: "c1", parentId: "root", timestamp: 200 });
  const c2 = mkEntry({ id: "c2", parentId: "root", timestamp: 300 });
  const gc = mkEntry({ id: "gc", parentId: "c1", timestamp: 400 });

  appendEntry(tree, root);
  appendEntry(tree, c1);
  branch(tree, root.id);
  appendEntry(tree, c2);
  // gc is child of c1 (but c1 is no longer active leaf)
  tree.entries.set(gc.id, gc);

  const leaves = getLeaves(tree);
  assert.equal(leaves.length, 2); // c2 and gc
});

// ---------------------------------------------------------------------------
// buildTree
// ---------------------------------------------------------------------------

test("buildTree returns nested tree for UI", () => {
  const tree = createTree();
  const root = mkEntry({ id: "root", parentId: null, timestamp: 100 });
  const c1 = mkEntry({ id: "c1", parentId: "root", timestamp: 200 });
  const c2 = mkEntry({ id: "c2", parentId: "c1", timestamp: 300 });

  appendEntry(tree, root);
  appendEntry(tree, c1);
  appendEntry(tree, c2);

  const nodes = buildTree(tree);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].entry.id, "root");
  assert.equal(nodes[0].isActive, true);
  assert.equal(nodes[0].isLeaf, false);
  assert.equal(nodes[0].children.length, 1);
  assert.equal(nodes[0].children[0].entry.id, "c1");
  assert.equal(nodes[0].children[0].children[0].entry.id, "c2");
  assert.equal(nodes[0].children[0].children[0].isLeaf, true);
});

test("buildTree marks inactive branches correctly", () => {
  const tree = createTree();
  const root = mkEntry({ id: "root", parentId: null, timestamp: 100 });
  const c1 = mkEntry({ id: "c1", parentId: "root", timestamp: 200 });
  const c2 = mkEntry({ id: "c2", parentId: "root", timestamp: 300 });

  appendEntry(tree, root);
  appendEntry(tree, c1);
  branch(tree, root.id);
  appendEntry(tree, c2);

  const nodes = buildTree(tree);
  // Root has 2 children
  assert.equal(nodes[0].children.length, 2);
  // c1 is inactive (not on active path root→c2)
  assert.equal(nodes[0].children[0].isActive, false);
  // c2 is active (it's the leaf)
  assert.equal(nodes[0].children[1].isActive, true);
  assert.equal(nodes[0].children[1].isLeaf, true);
});

// ---------------------------------------------------------------------------
// getActivePathIds
// ---------------------------------------------------------------------------

test("getActivePathIds returns set of IDs on active path", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null });
  const e2 = mkEntry({ parentId: e1.id });
  const e3 = mkEntry({ parentId: e2.id });

  appendEntry(tree, e1);
  appendEntry(tree, e2);
  appendEntry(tree, e3);

  const ids = getActivePathIds(tree);
  assert.equal(ids.size, 3);
  assert.ok(ids.has(e1.id));
  assert.ok(ids.has(e2.id));
  assert.ok(ids.has(e3.id));
});

// ---------------------------------------------------------------------------
// isAncestor
// ---------------------------------------------------------------------------

test("isAncestor detects ancestor relationship", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null });
  const e2 = mkEntry({ parentId: e1.id });
  const e3 = mkEntry({ parentId: e2.id });

  appendEntry(tree, e1);
  appendEntry(tree, e2);
  appendEntry(tree, e3);

  assert.ok(isAncestor(tree, e1.id, e3.id));
  assert.ok(isAncestor(tree, e2.id, e3.id));
  assert.ok(!isAncestor(tree, e3.id, e1.id));
  assert.ok(isAncestor(tree, e1.id, e1.id)); // self-ancestor
});

// ---------------------------------------------------------------------------
// commonAncestor
// ---------------------------------------------------------------------------

test("commonAncestor finds shared ancestor", () => {
  const tree = createTree();
  const root = mkEntry({ id: "root", parentId: null, timestamp: 100 });
  const a = mkEntry({ id: "a", parentId: "root", timestamp: 200 });
  const b = mkEntry({ id: "b", parentId: "root", timestamp: 300 });
  const a1 = mkEntry({ id: "a1", parentId: "a", timestamp: 400 });
  const b1 = mkEntry({ id: "b1", parentId: "b", timestamp: 500 });

  appendEntry(tree, root);
  appendEntry(tree, a);
  appendEntry(tree, a1);

  // Manually add b and b1
  tree.entries.set(b.id, b);
  tree.entries.set(b1.id, b1);

  assert.equal(commonAncestor(tree, "a1", "b1"), "root");
  assert.equal(commonAncestor(tree, "a1", "a"), "a");
  assert.equal(commonAncestor(tree, "a1", "a1"), "a1");
});

// ---------------------------------------------------------------------------
// extractPath
// ---------------------------------------------------------------------------

test("extractPath returns root → target path", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null });
  const e2 = mkEntry({ parentId: e1.id });
  const e3 = mkEntry({ parentId: e2.id });

  appendEntry(tree, e1);
  appendEntry(tree, e2);
  appendEntry(tree, e3);

  const path = extractPath(tree, e2.id);
  assert.equal(path.length, 2);
  assert.equal(path[0].id, e1.id);
  assert.equal(path[1].id, e2.id);
});

// ---------------------------------------------------------------------------
// buildBranchSummary
// ---------------------------------------------------------------------------

test("buildBranchSummary describes abandoned branch", () => {
  const tree = createTree();
  const root = mkEntry({ id: "root", parentId: null, timestamp: 100, type: "user", content: "Hello" });
  const a1 = mkEntry({ id: "a1", parentId: "root", timestamp: 200, type: "assistant", content: "Hi there" });
  const a2 = mkEntry({ id: "a2", parentId: "a1", timestamp: 300, type: "user", content: "Fix the bug" });

  appendEntry(tree, root);
  appendEntry(tree, a1);
  appendEntry(tree, a2);

  // Branch from root — abandoned path is a1 → a2 (root is the branch point, excluded)
  const summary = buildBranchSummary(tree, "root", "a2");
  assert.ok(summary.includes("1 user message"));
  assert.ok(summary.includes("1 assistant response"));
  assert.ok(summary.includes("Fix the bug"));
});

test("buildBranchSummary handles empty branch", () => {
  const tree = createTree();
  const root = mkEntry({ id: "root", parentId: null, timestamp: 100 });
  appendEntry(tree, root);

  const summary = buildBranchSummary(tree, "root", "root");
  assert.equal(summary, "Empty branch.");
});

// ---------------------------------------------------------------------------
// serializeTreeMeta / deserializeTree
// ---------------------------------------------------------------------------

test("serialize and deserialize round-trips tree state", () => {
  resetIdCounter();
  const tree = createTree();
  const e1 = mkEntry({ parentId: null });
  const e2 = mkEntry({ parentId: e1.id });
  const e3 = mkEntry({ parentId: e1.id });

  appendEntry(tree, e1);
  appendEntry(tree, e2);
  branch(tree, e1.id);
  appendEntry(tree, e3);

  const meta = serializeTreeMeta(tree);
  assert.equal(meta.leafId, e3.id);
  assert.equal(meta.parentMap[e1.id], null);
  assert.equal(meta.parentMap[e2.id], e1.id);
  assert.equal(meta.parentMap[e3.id], e1.id);

  // Rebuild
  const entries = [...tree.entries.values()];
  const restored = deserializeTree(meta, entries);
  assert.equal(restored.leafId, e3.id);
  assert.equal(restored.entries.size, 3);
  assert.equal(restored.roots.size, 1);

  // Path should match
  const path = getPath(restored);
  assert.equal(path.length, 2);
  assert.equal(path[0].id, e1.id);
  assert.equal(path[1].id, e3.id);
});
