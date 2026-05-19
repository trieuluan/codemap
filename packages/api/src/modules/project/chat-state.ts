import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { desc, eq } from "drizzle-orm";
import { projectImport } from "../../db/schema";
import type { Database } from "./service.shared";

const execFileAsync = promisify(execFile);

export type ChatAuthMode = "local" | "cloud" | "unauthenticated";
export type ChatIndexStatus = "fresh" | "stale" | "indexing" | "failed" | "missing";

export type ChatWorkspaceState = {
  projectId: string;
  projectName: string;
  repoName: string | null;
  branch: string | null;
  commitSha: string | null;
  indexedCommitSha: string | null;
  indexStatus: ChatIndexStatus;
  indexUpdatedAt: string | null;
  isIndexStale: boolean;
  hasLocalChanges: boolean;
  changedFilesCount: number;
  changedFiles: string[];
  authMode: ChatAuthMode;
  activeContextSummary: string | null;
};

export type ChatContextItem = {
  id: string;
  type: "file" | "symbol" | "search" | "diff" | "tool_call" | "assumption";
  label: string;
  source: "user" | "tool" | "system";
  pinned: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type ChatContextState = {
  conversationId: string;
  files: ChatContextItem[];
  symbols: ChatContextItem[];
  searches: ChatContextItem[];
  diffs: ChatContextItem[];
  toolCalls: ChatContextItem[];
  assumptions: ChatContextItem[];
  pinnedItems: ChatContextItem[];
};

async function runGit(cwd: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

function repoNameFromProject(projectRecord: { name: string; repositoryUrl: string | null; localWorkspacePath: string | null }) {
  const source = projectRecord.repositoryUrl ?? projectRecord.localWorkspacePath ?? projectRecord.name;
  return source.replace(/\.git$/, "").split(/[\\/]/).filter(Boolean).pop() ?? projectRecord.name;
}

function statusFromImport(latestImport: typeof projectImport.$inferSelect | null, stale: boolean): ChatIndexStatus {
  if (!latestImport) return "missing";
  if (["pending", "queued", "running"].includes(latestImport.status) || ["pending", "queued", "running"].includes(latestImport.parseStatus)) return "indexing";
  if (latestImport.status === "failed" || latestImport.parseStatus === "failed") return "failed";
  return stale ? "stale" : "fresh";
}

export function createChatStateService(database: Database) {
  return {
    async getChatWorkspaceState(projectId: string): Promise<ChatWorkspaceState | null> {
      const projectRecord = await database.query.project.findFirst({
        where: (project, { eq }) => eq(project.id, projectId),
      });
      if (!projectRecord) return null;

      const latestImport = await database.query.projectImport.findFirst({
        where: eq(projectImport.projectId, projectId),
        orderBy: [desc(projectImport.startedAt), desc(projectImport.createdAt)],
      });

      const workspacePath = projectRecord.localWorkspacePath ?? latestImport?.sourceWorkspacePath ?? null;
      const branch = workspacePath ? await runGit(workspacePath, ["rev-parse", "--abbrev-ref", "HEAD"]) : projectRecord.defaultBranch ?? latestImport?.branch ?? null;
      const commitSha = workspacePath ? await runGit(workspacePath, ["rev-parse", "HEAD"]) : latestImport?.commitSha ?? null;
      const changedOutput = workspacePath ? await runGit(workspacePath, ["status", "--porcelain"]) : null;
      const changedFiles = changedOutput ? changedOutput.split("\n").map((line) => line.slice(3).trim()).filter(Boolean) : [];
      const indexedCommitSha = latestImport?.commitSha ?? null;
      const indexUpdatedAt = (latestImport?.parseCompletedAt ?? latestImport?.completedAt ?? latestImport?.updatedAt ?? null)?.toISOString() ?? null;
      const isIndexStale = changedFiles.length > 0 || Boolean(commitSha && indexedCommitSha && commitSha !== indexedCommitSha);

      return {
        projectId: projectRecord.id,
        projectName: projectRecord.name,
        repoName: repoNameFromProject(projectRecord),
        branch,
        commitSha,
        indexedCommitSha,
        indexStatus: statusFromImport(latestImport ?? null, isIndexStale),
        indexUpdatedAt,
        isIndexStale,
        hasLocalChanges: changedFiles.length > 0,
        changedFilesCount: changedFiles.length,
        changedFiles,
        authMode: projectRecord.provider === "local_workspace" ? "local" : "cloud",
        activeContextSummary: null,
      };
    },

    getChatContextState(conversationId: string): ChatContextState {
      return { conversationId, files: [], symbols: [], searches: [], diffs: [], toolCalls: [], assumptions: [], pinnedItems: [] };
    },
  };
}
