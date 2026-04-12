import * as assert from "node:assert";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildProjectTree,
  type ProjectTreeNode,
} from "../../../src/modules/project-import/tree-builder";

function getChildNames(nodes: ProjectTreeNode[] | undefined) {
  return (nodes ?? []).map((node) => node.name);
}

test("buildProjectTree returns a deterministic directory-first tree", async (t) => {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-tree-builder-test-"),
  );

  t.after(async () => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(workspaceRoot, { recursive: true, force: true }),
    );
  });

  await Promise.all([
    mkdir(path.join(workspaceRoot, "src", "utils"), { recursive: true }),
    mkdir(path.join(workspaceRoot, "docs"), { recursive: true }),
    mkdir(path.join(workspaceRoot, "node_modules"), { recursive: true }),
    mkdir(path.join(workspaceRoot, ".git"), { recursive: true }),
  ]);

  await Promise.all([
    writeFile(path.join(workspaceRoot, "README.md"), "# CodeMap\n"),
    writeFile(path.join(workspaceRoot, "package.json"), "{}\n"),
    writeFile(path.join(workspaceRoot, "src", "index.ts"), "export {};\n"),
    writeFile(
      path.join(workspaceRoot, "src", "utils", "sort.ts"),
      "export const sort = true;\n",
    ),
    writeFile(path.join(workspaceRoot, "node_modules", "ignored.js"), ""),
    symlink(
      path.join(workspaceRoot, "src"),
      path.join(workspaceRoot, "linked-src"),
      "dir",
    ),
  ]);

  const tree = await buildProjectTree(workspaceRoot, "codemap");

  assert.equal(tree.name, "codemap");
  assert.equal(tree.path, "");
  assert.equal(tree.type, "directory");
  assert.deepStrictEqual(getChildNames(tree.children), [
    "docs",
    "src",
    "package.json",
    "README.md",
  ]);

  const srcNode = tree.children?.find((node) => node.name === "src");

  assert.ok(srcNode);
  assert.equal(srcNode?.type, "directory");
  assert.equal(srcNode?.path, "src");
  assert.deepStrictEqual(getChildNames(srcNode?.children), ["utils", "index.ts"]);

  const fileNode = srcNode?.children?.find((node) => node.name === "index.ts");
  assert.equal(fileNode?.type, "file");
  assert.equal(fileNode?.path, "src/index.ts");
  assert.equal(fileNode?.extension, "ts");
});
