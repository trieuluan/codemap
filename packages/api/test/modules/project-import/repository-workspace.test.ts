import * as assert from "node:assert";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildRepositoryWorkspaceLocation,
  createRepositoryWorkspaceService,
} from "../../../src/modules/project-import/repository-workspace";

test("buildRepositoryWorkspaceLocation uses project and import scoped storage keys", () => {
  const originalStorageRoot = process.env.CODEMAP_STORAGE_ROOT;
  process.env.CODEMAP_STORAGE_ROOT = "/tmp/codemap-storage";

  try {
    const location = buildRepositoryWorkspaceLocation({
      projectId: "project-123",
      importId: "import-456",
    });

    assert.equal(location.storageRoot, "/tmp/codemap-storage");
    assert.equal(location.storageKey, "repos/project-123/import-456");
    assert.equal(
      location.workspacePath,
      path.join("/tmp/codemap-storage", "repos", "project-123", "import-456"),
    );
  } finally {
    if (originalStorageRoot === undefined) {
      delete process.env.CODEMAP_STORAGE_ROOT;
    } else {
      process.env.CODEMAP_STORAGE_ROOT = originalStorageRoot;
    }
  }
});

test("repository workspace service promotes staged workspaces and removes retained workspaces", async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "codemap-repo-workspace-test-"));
  const originalStorageRoot = process.env.CODEMAP_STORAGE_ROOT;
  process.env.CODEMAP_STORAGE_ROOT = tempRoot;

  t.after(async () => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(tempRoot, { recursive: true, force: true }),
    );

    if (originalStorageRoot === undefined) {
      delete process.env.CODEMAP_STORAGE_ROOT;
    } else {
      process.env.CODEMAP_STORAGE_ROOT = originalStorageRoot;
    }
  });

  const stagedRoot = await mkdtemp(path.join(os.tmpdir(), "codemap-repo-stage-test-"));
  const stagedWorkspacePath = path.join(stagedRoot, "repo");
  await mkdir(stagedWorkspacePath, { recursive: true });
  await writeFile(path.join(stagedWorkspacePath, "README.md"), "# CodeMap\n");

  t.after(async () => {
    await import("node:fs/promises").then(({ rm }) =>
      rm(stagedRoot, { recursive: true, force: true }),
    );
  });

  const service = createRepositoryWorkspaceService();
  const location = await service.promoteStagedWorkspace({
    projectId: "project-1",
    importId: "import-1",
    stagedWorkspacePath,
  });

  assert.equal(
    await readFile(path.join(location.workspacePath, "README.md"), "utf8"),
    "# CodeMap\n",
  );

  await service.removeWorkspaceByPath(location.workspacePath);

  await assert.rejects(
    () => readFile(path.join(location.workspacePath, "README.md"), "utf8"),
    /ENOENT/,
  );
});
