import type { CodeMapClient } from "./codemap-api.js";
import { tryGetCurrentWorkspaceInfo, type CurrentWorkspaceInfo } from "./workspace-git.js";
import type { ProjectImportDetail } from "./api-types.js";

type ProjectLike = {
  repositoryUrl?: string | null;
  localWorkspacePath?: string | null;
};

export type ImportHealthState =
  | "ready"
  | "stale"
  | "importing"
  | "parse_pending"
  | "failed"
  | "missing_import"
  | "unknown";

export type ImportHealthNextAction =
  | "none"
  | "wait_for_import"
  | "trigger_reimport"
  | "inspect_import_error";

export interface ImportHealth {
  state: ImportHealthState;
  isReady: boolean;
  isStale: boolean;
  needsReimport: boolean;
  nextAction: ImportHealthNextAction;
  latestImport: ProjectImportDetail | null;
  workspace: CurrentWorkspaceInfo | null;
  commitComparison: {
    status: "same" | "different" | "unknown";
    importCommit: string | null;
    workspaceCommit: string | null;
  };
}

function normalizeRepositoryUrl(value: string) {
  return value.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
}

function shouldCompareWorkspaceCommit(
  project: ProjectLike | null | undefined,
  workspace: CurrentWorkspaceInfo | null,
) {
  if (!workspace || !project) return false;

  if (
    project.repositoryUrl &&
    workspace.remoteUrl &&
    normalizeRepositoryUrl(project.repositoryUrl) ===
      normalizeRepositoryUrl(workspace.remoteUrl)
  ) {
    return true;
  }

  return Boolean(
    project.localWorkspacePath &&
      workspace.repoRootPath &&
      project.localWorkspacePath === workspace.repoRootPath,
  );
}

export function isImportDone(status: ProjectImportDetail["status"]) {
  return status === "completed" || status === "failed";
}

export async function fetchLatestProjectImport(
  client: CodeMapClient,
  projectId: string,
) {
  const imports = await client.request<ProjectImportDetail[]>(
    `/projects/${encodeURIComponent(projectId)}/imports`,
    { authRequired: true },
  );

  return imports[0] ?? null;
}

function compareCommits(
  latestImport: ProjectImportDetail | null,
  workspace: CurrentWorkspaceInfo | null,
): ImportHealth["commitComparison"] {
  const importCommit = latestImport?.commitSha ?? null;
  const workspaceCommit = workspace?.commitSha ?? null;

  if (!importCommit || !workspaceCommit) {
    return { status: "unknown", importCommit, workspaceCommit };
  }

  return {
    status: importCommit === workspaceCommit ? "same" : "different",
    importCommit,
    workspaceCommit,
  };
}

export function buildImportHealth(input: {
  latestImport: ProjectImportDetail | null;
  workspace: CurrentWorkspaceInfo | null;
  project?: ProjectLike | null;
}): ImportHealth {
  const { latestImport, workspace, project } = input;
  const comparableWorkspace = shouldCompareWorkspaceCommit(project, workspace)
    ? workspace
    : null;
  const commitComparison = compareCommits(latestImport, comparableWorkspace);

  if (!latestImport) {
    return {
      state: "missing_import",
      isReady: false,
      isStale: false,
      needsReimport: true,
      nextAction: "trigger_reimport",
      latestImport,
      workspace: comparableWorkspace,
      commitComparison,
    };
  }

  if (latestImport.status === "failed" || latestImport.parseStatus === "failed") {
    return {
      state: "failed",
      isReady: false,
      isStale: false,
      needsReimport: true,
      nextAction: "inspect_import_error",
      latestImport,
      workspace: comparableWorkspace,
      commitComparison,
    };
  }

  if (latestImport.status === "queued" || latestImport.status === "running") {
    return {
      state: "importing",
      isReady: false,
      isStale: false,
      needsReimport: false,
      nextAction: "wait_for_import",
      latestImport,
      workspace: comparableWorkspace,
      commitComparison,
    };
  }

  if (
    latestImport.parseStatus === "pending" ||
    latestImport.parseStatus === "queued" ||
    latestImport.parseStatus === "running"
  ) {
    return {
      state: "parse_pending",
      isReady: false,
      isStale: false,
      needsReimport: false,
      nextAction: "wait_for_import",
      latestImport,
      workspace: comparableWorkspace,
      commitComparison,
    };
  }

  if (
    latestImport.status === "completed" &&
    latestImport.parseStatus === "completed" &&
    commitComparison.status === "different"
  ) {
    return {
      state: "stale",
      isReady: false,
      isStale: true,
      needsReimport: true,
      nextAction: "trigger_reimport",
      latestImport,
      workspace: comparableWorkspace,
      commitComparison,
    };
  }

  if (latestImport.status === "completed" && latestImport.parseStatus === "completed") {
    return {
      state: "ready",
      isReady: true,
      isStale: false,
      needsReimport: false,
      nextAction: "none",
      latestImport,
      workspace: comparableWorkspace,
      commitComparison,
    };
  }

  return {
    state: "unknown",
    isReady: false,
    isStale: false,
    needsReimport: false,
    nextAction: "wait_for_import",
    latestImport,
    workspace: comparableWorkspace,
    commitComparison,
  };
}

export async function getProjectImportHealth(
  client: CodeMapClient,
  projectId: string,
  project?: ProjectLike | null,
) {
  const [latestImport, workspace] = await Promise.all([
    fetchLatestProjectImport(client, projectId),
    tryGetCurrentWorkspaceInfo(),
  ]);

  return buildImportHealth({ latestImport, workspace, project });
}

export function formatShortCommit(commit: string | null | undefined) {
  return commit ? commit.slice(0, 8) : null;
}

export function describeImportHealth(health: ImportHealth) {
  const lines = [
    `Index health: ${health.state}`,
    health.latestImport?.commitSha
      ? `Import commit: ${formatShortCommit(health.latestImport.commitSha)}`
      : null,
    health.workspace?.commitSha
      ? `Local commit: ${formatShortCommit(health.workspace.commitSha)}`
      : null,
    health.commitComparison.status === "different"
      ? "Local workspace differs from the latest indexed commit."
      : null,
    health.nextAction !== "none" ? `Next action: ${health.nextAction}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}
