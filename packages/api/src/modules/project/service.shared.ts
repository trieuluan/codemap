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
