import * as assert from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { buildImportHealth } from "../dist/lib/import-health.js";
import { resolveWorkspace } from "../dist/lib/workspace-resolver.js";

const execFileAsync = promisify(execFile);

const completedImport = {
  id: "import-1",
  projectId: "project-1",
  status: "completed" as const,
  parseStatus: "completed" as const,
  branch: "main",
  commitSha: "abc123",
  errorMessage: null,
  parseError: null,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
};

function workspace(input?: { commitSha?: string; remoteUrl?: string | null }) {
  return {
    workspacePath: "/repo",
    repoRootPath: "/repo",
    repoName: "repo",
    branch: "main",
    commitSha: input?.commitSha ?? "abc123",
    remoteUrl: input?.remoteUrl ?? "git@github.com:owner/repo.git",
  };
}

test("import health marks matching workspace commit as ready", () => {
  const health = buildImportHealth({
    latestImport: completedImport,
    workspace: workspace(),
    workspaceResolution: "git",
    project: { repositoryUrl: "https://github.com/owner/repo" },
  });

  assert.equal(health.state, "ready");
  assert.equal(health.commitComparison.status, "same");
  assert.equal(health.workspaceResolution, "git");
});

test("import health marks different workspace commit as stale", () => {
  const health = buildImportHealth({
    latestImport: completedImport,
    workspace: workspace({ commitSha: "def456" }),
    workspaceResolution: "git",
    project: { repositoryUrl: "https://github.com/owner/repo" },
  });

  assert.equal(health.state, "stale");
  assert.equal(health.needsReimport, true);
  assert.equal(health.nextAction, "trigger_reimport");
});

test("import health treats unrelated workspaces as unknown staleness", () => {
  const health = buildImportHealth({
    latestImport: completedImport,
    workspace: workspace({ remoteUrl: "git@github.com:other/repo.git" }),
    workspaceResolution: "git",
    project: { repositoryUrl: "https://github.com/owner/repo" },
  });

  assert.equal(health.state, "ready");
  assert.equal(health.commitComparison.status, "unknown");
  assert.equal(health.workspace, null);
});

test("workspace resolver can use linked config when cwd is outside repo", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codemap-mcp-workspace-"));
  const repoRoot = path.join(root, "repo");
  const serverCwd = path.join(root, "server");

  await mkdir(repoRoot, { recursive: true });
  await mkdir(path.join(serverCwd, ".codemap"), { recursive: true });
  await execFileAsync("git", ["init"], { cwd: repoRoot });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoRoot,
  });
  await execFileAsync("git", ["config", "user.name", "Test User"], {
    cwd: repoRoot,
  });
  await writeFile(path.join(repoRoot, "README.md"), "hello\n", "utf8");
  await execFileAsync("git", ["add", "README.md"], { cwd: repoRoot });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd: repoRoot });
  await execFileAsync(
    "git",
    ["remote", "add", "origin", "git@github.com:owner/repo.git"],
    { cwd: repoRoot },
  );
  await writeFile(
    path.join(serverCwd, ".codemap", "mcp.json"),
    `${JSON.stringify(
      {
        projectId: "project-1",
        workspaceRootPath: repoRoot,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const resolved = await resolveWorkspace({ cwd: serverCwd });

  assert.equal(resolved.resolution, "linked_config");
  assert.equal(resolved.workspace?.repoRootPath, await realpath(repoRoot));
});
