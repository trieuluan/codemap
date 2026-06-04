import assert from "node:assert/strict";
import test from "node:test";
import { flattenTreeForPicker } from "./input.js";
import type { TreeNode } from "../../chat/session-tree.js";

// ── Helpers ────────────────────────────────────────────────────────────────

let _id = 0;
function resetId() {
  _id = 0;
}

function mkEntry(
  type: "user" | "assistant" | "tool" | "system" | "branch_summary",
  parentId: string | null,
): { id: string; parentId: string | null; timestamp: number; type: typeof type; content: string } {
  const id = `e${++_id}`;
  return { id, parentId, timestamp: Date.now() + _id, type, content: `content-${id}` };
}

function mkNode(
  entry: ReturnType<typeof mkEntry>,
  depth: number,
  isActive: boolean,
  isLeaf: boolean,
  children: TreeNode[] = [],
): TreeNode {
  return {
    entry: entry as never,
    depth,
    isActive,
    isLeaf,
    children,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("flattenTreeForPicker: user-only filter resets depth to compact values (not full-tree depth)", () => {
  resetId();
  // Simulate: user(0) → assistant(1) → tool(2) → user(3)
  // Full-tree depths: 0, 1, 2, 3
  // After user-only filter: only the two user nodes remain
  // Their compact depths should be: 0, 0  (neither is a child of the other in the visible set)

  const entryU1 = mkEntry("user", null);
  const entryA1 = mkEntry("assistant", entryU1.id);
  const entryT1 = mkEntry("tool", entryA1.id);
  const entryU2 = mkEntry("user", entryT1.id); // full depth = 3, parent not visible

  const nodeU2 = mkNode(entryU2, 3, true, true);
  const nodeT1 = mkNode(entryT1, 2, true, false, [nodeU2]);
  const nodeA1 = mkNode(entryA1, 1, true, false, [nodeT1]);
  const nodeU1 = mkNode(entryU1, 0, true, false, [nodeA1]);

  const items = flattenTreeForPicker([nodeU1], 2, new Set());

  assert.equal(items.length, 2, "should have exactly 2 user entries");
  assert.equal(items[0]!.type, "user");
  assert.equal(items[1]!.type, "user");

  // Neither user message is a visible parent of the other (parent chain goes through hidden nodes)
  assert.equal(items[0]!.depth, 0, "first user entry: compact depth should be 0");
  assert.equal(items[1]!.depth, 0, "second user entry: compact depth should be 0 (parent is hidden)");
});

test("flattenTreeForPicker: user-only filter preserves depth when user is direct parent of another user", () => {
  resetId();
  // user(0) → user(1) — user directly parents user (uncommon but possible via branch_summary chain)
  const entryU1 = mkEntry("user", null);
  const entryU2 = mkEntry("user", entryU1.id); // direct user→user parent

  const nodeU2 = mkNode(entryU2, 1, true, true);
  const nodeU1 = mkNode(entryU1, 0, true, false, [nodeU2]);

  const items = flattenTreeForPicker([nodeU1], 2, new Set());

  assert.equal(items.length, 2, "should have 2 user entries");
  // After reverse: newest (child) is at index 0, oldest (parent) at index 1
  assert.equal(items[0]!.depth, 1, "child user (directly parented by visible user): compact depth 1");
  assert.equal(items[1]!.depth, 0, "parent user: compact depth 0");
});

test("flattenTreeForPicker: default filter keeps full-tree depths unchanged", () => {
  resetId();
  const entryU1 = mkEntry("user", null);
  const entryA1 = mkEntry("assistant", entryU1.id);
  const entryU2 = mkEntry("user", entryA1.id);

  const nodeU2 = mkNode(entryU2, 2, true, true);
  const nodeA1 = mkNode(entryA1, 1, true, false, [nodeU2]);
  const nodeU1 = mkNode(entryU1, 0, true, false, [nodeA1]);

  const items = flattenTreeForPicker([nodeU1], 0, new Set());

  assert.equal(items.length, 3, "default: all 3 entries visible");
  // After reverse: newest (deepest) is at index 0
  assert.equal(items[0]!.depth, 2);
  assert.equal(items[1]!.depth, 1);
  assert.equal(items[2]!.depth, 0);
});

test("flattenTreeForPicker: user-only with branching keeps each branch at correct compact depth", () => {
  resetId();
  // user(0) → assistant(1) → user-branchA(2) and user-branchB(2)
  // After user-only: user(0) should have depth 0, branchA/B also depth 0 (parents hidden)

  const entryU1 = mkEntry("user", null);
  const entryA1 = mkEntry("assistant", entryU1.id);
  const entryUA = mkEntry("user", entryA1.id); // depth 2 in full tree
  const entryUB = mkEntry("user", entryA1.id); // depth 2 in full tree

  const nodeUA = mkNode(entryUA, 2, false, true);
  const nodeUB = mkNode(entryUB, 2, true, true);
  const nodeA1 = mkNode(entryA1, 1, true, false, [nodeUA, nodeUB]);
  const nodeU1 = mkNode(entryU1, 0, true, false, [nodeA1]);

  const items = flattenTreeForPicker([nodeU1], 2, new Set());

  const depths = items.map((i) => i.depth);
  // All user messages have hidden parents → all depth 0
  assert.ok(depths.every((d) => d === 0), `expected all depths 0, got: ${depths}`);
});
