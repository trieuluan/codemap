import path from "node:path";
import { readLocalIndex } from "./local-index.js";
import { tryGetCurrentWorkspaceInfo } from "./workspace-git.js";

function formatAge(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export async function buildSessionContext(cwd: string): Promise<string> {
  const store = await readLocalIndex();

  if (!store) {
    return [
      "[CodeMap] No local index found.",
      "→ Call refresh_local_index before reading or editing files.",
    ].join("\n");
  }

  const meta = store.getMeta();
  const summary = store.getSummary();
  const projectName = path.basename(summary.workspaceRootPath);
  const indexedAgo = meta?.indexedAt ? formatAge(new Date(meta.indexedAt)) : "never";

  const lines: string[] = [
    `[CodeMap] ${projectName} · ${summary.fileCount} files · ${summary.symbolCount} symbols · indexed ${indexedAgo}`,
  ];

  // Stale check
  if (meta?.commitSha && meta.workspaceRootPath) {
    const gitInfo = await tryGetCurrentWorkspaceInfo(meta.workspaceRootPath).catch(() => null);
    if (gitInfo && gitInfo.commitSha !== meta.commitSha) {
      lines.push(`⚠ INDEX STALE (was ${meta.commitSha.slice(0, 7)}, HEAD moved) — call refresh_local_index first.`);
    }
  }

  lines.push("→ For broad tasks with unclear files: call explore_task(task=<description>)");

  return lines.join("\n");
}
