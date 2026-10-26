import assert from "node:assert/strict";
import test from "node:test";
import { matchWorkspacePaths } from "./MapFileSidebar.js";

test("workspace search finds deep indexed files without expanding directories", () => {
  assert.deepEqual(matchWorkspacePaths([
    "packages/web/src/renderer/components/CodeMapPanel.tsx",
    "packages/core/src/graph.ts",
    "packages/web/src/renderer/components/CodeMapPanel.tsx",
  ], "  codemappanel  "), ["packages/web/src/renderer/components/CodeMapPanel.tsx"]);
});

test("workspace search matches paths and ranks file names before parent directory matches", () => {
  assert.deepEqual(matchWorkspacePaths(["src/graph/helper.ts", "lib/graph.ts", "README.md"], "graph"), ["lib/graph.ts", "src/graph/helper.ts"]);
  assert.deepEqual(matchWorkspacePaths(["README.md"], "  "), []);
  assert.equal(matchWorkspacePaths(Array.from({ length: 120 }, (_, index) => `src/file-${index}.ts`), "file").length, 100);
});
