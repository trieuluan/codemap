import test from "node:test";
import assert from "node:assert/strict";
import { diffGitSnapshots } from "./turn-changed-summary.js";
import type { GitDiffSnapshot } from "./turn-changed-summary.js";

function snapshot(entries: Array<[string, {
  kind: "new" | "edited" | "deleted" | "renamed";
  additions?: number;
  deletions?: number;
  previousPath?: string;
}]>): GitDiffSnapshot {
  return {
    files: new Map(
      entries.map(([path, meta]) => [
        path,
        {
          path,
          kind: meta.kind,
          additions: meta.additions ?? 0,
          deletions: meta.deletions ?? 0,
          previousPath: meta.previousPath,
        },
      ]),
    ),
  };
}

test("diffGitSnapshots returns only files changed after the baseline", () => {
  const before = snapshot([
    ["existing.ts", { kind: "edited", additions: 2, deletions: 1 }],
    ["kept-new.ts", { kind: "new" }],
  ]);
  const after = snapshot([
    ["existing.ts", { kind: "edited", additions: 2, deletions: 1 }],
    ["kept-new.ts", { kind: "new" }],
    ["fresh.ts", { kind: "edited", additions: 5, deletions: 0 }],
    ["added.ts", { kind: "new" }],
  ]);

  const summary = diffGitSnapshots(before, after);

  assert.deepEqual(summary, {
    files: [
      { path: "added.ts", kind: "new", additions: 0, deletions: 0, previousPath: undefined },
      { path: "fresh.ts", kind: "edited", additions: 5, deletions: 0, previousPath: undefined },
    ],
    newCount: 1,
    editedCount: 1,
    deletedCount: 0,
    renamedCount: 0,
  });
});

test("diffGitSnapshots includes files whose diff stats changed during the turn", () => {
  const before = snapshot([
    ["existing.ts", { kind: "edited", additions: 2, deletions: 1 }],
  ]);
  const after = snapshot([
    ["existing.ts", { kind: "edited", additions: 7, deletions: 1 }],
  ]);

  const summary = diffGitSnapshots(before, after);

  assert.deepEqual(summary, {
    files: [
      { path: "existing.ts", kind: "edited", additions: 7, deletions: 1, previousPath: undefined },
    ],
    newCount: 0,
    editedCount: 1,
    deletedCount: 0,
    renamedCount: 0,
  });
});

test("diffGitSnapshots returns null when nothing changed after the baseline", () => {
  const before = snapshot([
    ["existing.ts", { kind: "edited", additions: 2, deletions: 1 }],
  ]);
  const after = snapshot([
    ["existing.ts", { kind: "edited", additions: 2, deletions: 1 }],
  ]);

  assert.equal(diffGitSnapshots(before, after), null);
});
