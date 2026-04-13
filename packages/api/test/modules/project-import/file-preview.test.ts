import * as assert from "node:assert";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import {
  buildUnavailableFilePreview,
  getProjectFilePreview,
  normalizeRepositoryFilePath,
} from "../../../src/modules/project-import/file-preview";
import type { ProjectTreeNode } from "../../../src/modules/project-import/tree-builder";

test("normalizeRepositoryFilePath rejects traversal outside the repository", () => {
  assert.throws(
    () => normalizeRepositoryFilePath("../secrets.txt"),
    /must stay within the repository root/,
  );
});

test("buildUnavailableFilePreview returns a structured unavailable response", () => {
  assert.deepStrictEqual(
    buildUnavailableFilePreview({
      path: "src/missing.ts",
      reason: "Missing file",
    }),
    {
      path: "src/missing.ts",
      name: "missing.ts",
      type: "file",
      extension: null,
      language: null,
      status: "unavailable",
      content: null,
      sizeBytes: null,
      reason: "Missing file",
    },
  );
});

test("getProjectFilePreview returns text content for previewable files", async (t) => {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-file-preview-test-"),
  );

  t.after(async () => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(workspaceRoot, { recursive: true, force: true }),
    );
  });

  await mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await writeFile(
    path.join(workspaceRoot, "src", "index.ts"),
    "export const hello = 'world';\n",
  );

  const treeNode: ProjectTreeNode = {
    name: "index.ts",
    path: "src/index.ts",
    type: "file",
    extension: "ts",
  };

  const preview = await getProjectFilePreview({
    workspacePath: workspaceRoot,
    treeNode,
  });

  assert.equal(preview.status, "ready");
  assert.equal(preview.language, "TypeScript");
  assert.match(preview.content ?? "", /hello/);
});

test("getProjectFilePreview returns unsupported for directories", async () => {
  const preview = await getProjectFilePreview({
    workspacePath: "/tmp/repo",
    treeNode: {
      name: "src",
      path: "src",
      type: "directory",
      children: [],
    },
  });

  assert.equal(preview.status, "unsupported");
  assert.equal(preview.type, "directory");
});

test("getProjectFilePreview returns binary for files with null bytes", async (t) => {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-file-preview-binary-test-"),
  );

  t.after(async () => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(workspaceRoot, { recursive: true, force: true }),
    );
  });

  const filePath = path.join(workspaceRoot, "logo.png");
  await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));

  const preview = await getProjectFilePreview({
    workspacePath: workspaceRoot,
    treeNode: {
      name: "logo.png",
      path: "logo.png",
      type: "file",
      extension: "png",
    },
  });

  assert.equal(preview.status, "binary");
});

test("getProjectFilePreview returns too_large for oversized files", async (t) => {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-file-preview-large-test-"),
  );

  t.after(async () => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(workspaceRoot, { recursive: true, force: true }),
    );
  });

  await writeFile(
    path.join(workspaceRoot, "huge.txt"),
    "a".repeat(210 * 1024),
    "utf8",
  );

  const preview = await getProjectFilePreview({
    workspacePath: workspaceRoot,
    treeNode: {
      name: "huge.txt",
      path: "huge.txt",
      type: "file",
      extension: "txt",
    },
  });

  assert.equal(preview.status, "too_large");
});

test("getProjectFilePreview returns unavailable when the retained file is missing", async (t) => {
  const workspaceRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-file-preview-missing-test-"),
  );

  t.after(async () => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(workspaceRoot, { recursive: true, force: true }),
    );
  });

  const preview = await getProjectFilePreview({
    workspacePath: workspaceRoot,
    treeNode: {
      name: "missing.ts",
      path: "src/missing.ts",
      type: "file",
      extension: "ts",
    },
  });

  assert.equal(preview.status, "unavailable");
});
