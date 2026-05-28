import { loadConfig } from "../../config.js";
import type { ProjectDetail } from "../../lib/api-types.js";
import { createCodeMapClient } from "../../lib/codemap-api.js";
import { getProjectImportHealth } from "../../lib/import-health.js";
import { readLocalIndex } from "../../lib/local-index.js";
import { tryGetCurrentWorkspaceInfo } from "../../lib/workspace-git.js";
import { readWorkspaceProjectConfig } from "../../lib/workspace-project.js";

function formatAge(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function getWorkspaceStatusLines(): Promise<string[]> {
  const config = await loadConfig();
  const workspaceConfig = await readWorkspaceProjectConfig();
  const workspacePath = workspaceConfig.workspaceRootPath ?? process.cwd();
  const gitInfo = await tryGetCurrentWorkspaceInfo(workspacePath);
  const store = await readLocalIndex();
  const summary = store?.getSummary();
  const meta = store?.getMeta();
  const indexCommit = meta?.commitSha ?? null;
  const indexFresh = Boolean(
    store && (!gitInfo?.commitSha || !indexCommit || gitInfo.commitSha === indexCommit),
  );

  const lines: string[] = ["CodeMap workspace status", ""];
  lines.push(`Workspace: ${workspacePath}`);
  lines.push(
    `Git:       ${gitInfo ? `${gitInfo.branch} @ ${gitInfo.commitSha.slice(0, 7)}` : "not available"}`,
  );
  lines.push(`Remote:    ${gitInfo?.remoteUrl ?? "none"}`);
  lines.push("");
  lines.push(`Local index: ${store ? (indexFresh ? "fresh" : "stale") : "missing"}`);
  if (summary) {
    const indexedAt = summary.indexedAt ? new Date(summary.indexedAt) : null;
    lines.push(`  Cache:      ${summary.cachePath}`);
    lines.push(
      `  Indexed:    ${summary.indexedAt ?? "never"}${indexedAt ? ` (${formatAge(indexedAt)})` : ""}`,
    );
    lines.push(`  Commit:     ${indexCommit ? indexCommit.slice(0, 7) : "unknown"}`);
    lines.push(`  Files:      ${summary.fileCount}`);
    lines.push(`  Symbols:    ${summary.symbolCount}`);
  } else {
    lines.push("  Run `codemap local-index` to build the local index.");
  }

  lines.push("");
  lines.push(`Auth:      ${config.apiToken ? "authenticated" : "not authenticated"}`);
  lines.push(`API URL:   ${config.apiUrl}`);
  if (config.user?.email) lines.push(`User:      ${config.user.email}`);
  lines.push("");
  lines.push(
    `Project:   ${workspaceConfig.projectId ? `linked (${workspaceConfig.projectId})` : "not linked"}`,
  );

  if (workspaceConfig.projectId && config.apiToken) {
    const client = createCodeMapClient(config);
    try {
      const project = await client.request<ProjectDetail>(
        `/projects/${encodeURIComponent(workspaceConfig.projectId)}`,
        { authRequired: true },
      );
      const health = await getProjectImportHealth(client, workspaceConfig.projectId, project);
      const latest = health.latestImport;
      lines.push(`  Name:       ${project.name}`);
      lines.push(`  Status:     ${project.status}`);
      lines.push(`  Branch:     ${latest?.branch ?? project.defaultBranch ?? "unknown"}`);
      lines.push(
        `  Cloud:      ${latest ? `${latest.status} / parse ${latest.parseStatus ?? "unknown"}` : "no imports"}`,
      );
      if (latest?.createdAt) lines.push(`  Imported:   ${latest.createdAt}`);
      lines.push(
        `  Freshness:  ${health.isReady ? "ready" : health.state}${health.isStale ? " (stale)" : ""}`,
      );
      lines.push(`  Next:       ${health.nextAction}`);
    } catch (error) {
      lines.push(
        `  Cloud:      unavailable (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  } else if (workspaceConfig.projectId) {
    lines.push("  Cloud:      skipped (not authenticated)");
  } else {
    lines.push("  Cloud:      not configured");
  }

  return lines;
}

export async function runStatus(): Promise<void> {
  console.log((await getWorkspaceStatusLines()).join("\n"));
}
