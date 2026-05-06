import { and, eq, ne } from "drizzle-orm";
import { simpleGit } from "simple-git";
import type { db } from "../../db";
import { project, projectImport } from "../../db/schema";

export type Database = typeof db;
export type ProjectImportRecord = typeof projectImport.$inferSelect;

export function slugifyProjectName(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}

export function normalizeRepositoryUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function normalizeLocalWorkspacePath(value: string) {
  return value.trim();
}

export async function ensureUniqueSlug(
  database: Database,
  slug: string,
  excludeProjectId?: string,
) {
  let candidate = slug;
  let suffix = 1;

  while (true) {
    const existing = await database.query.project.findFirst({
      where: excludeProjectId
        ? and(eq(project.slug, candidate), ne(project.id, excludeProjectId))
        : eq(project.slug, candidate),
      columns: { id: true },
    });

    if (!existing) return candidate;
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
}

async function getCommitMessage(
  importRecord: ProjectImportRecord,
  fallbackWorkspacePath?: string | null,
) {
  if (!importRecord.commitSha) return null;

  const workspacePath =
    importRecord.sourceAvailable && importRecord.sourceWorkspacePath
      ? importRecord.sourceWorkspacePath
      : fallbackWorkspacePath;

  if (!workspacePath) return null;

  try {
    const message = await simpleGit(workspacePath).show([
      "-s",
      "--format=%s",
      importRecord.commitSha,
    ]);
    return message.trim() || null;
  } catch {
    return null;
  }
}

export async function resolveRepoVisibility(
  repositoryUrl: string,
): Promise<"public" | "private"> {
  try {
    const url = new URL(repositoryUrl);
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return "private";
    const [owner, repo] = parts;

    if (url.hostname === "github.com") {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: { Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { private: boolean };
        return data.private === false ? "public" : "private";
      }
    } else if (url.hostname === "gitlab.com") {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const res = await fetch(
        `https://gitlab.com/api/v4/projects/${encodedPath}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) {
        const data = (await res.json()) as { visibility: string };
        return data.visibility === "public" ? "public" : "private";
      }
    }
  } catch {
    // network error, timeout, non-JSON response
  }
  return "private";
}

export async function withCommitMessages(imports: ProjectImportRecord[]) {
  const fallbackWorkspacePath =
    imports.find((i) => i.sourceAvailable && i.sourceWorkspacePath)
      ?.sourceWorkspacePath ?? null;

  return Promise.all(
    imports.map(async (importRecord) => ({
      ...importRecord,
      commitMessage: await getCommitMessage(importRecord, fallbackWorkspacePath),
    })),
  );
}
