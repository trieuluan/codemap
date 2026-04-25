import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { db } from "../../db";
import { project, projectImport, projectMapSnapshot } from "../../db/schema";
import type {
  CreateProjectBody,
  CreateProjectFromGithubBody,
  CreateProjectImportBody,
  ProjectListInclude,
  UpdateProjectBody,
} from "./schema";

type Database = typeof db;

function slugifyProjectName(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}

export function createProjectService(database: Database) {
  function normalizeRepositoryUrl(value: string) {
    return value.trim().replace(/\/+$/, "");
  }

  function normalizeLocalWorkspacePath(value: string) {
    return value.trim();
  }

  async function ensureUniqueSlug(slug: string, excludeProjectId?: string) {
    let candidate = slug;
    let suffix = 1;

    while (true) {
      const existing = await database.query.project.findFirst({
        where: excludeProjectId
          ? and(eq(project.slug, candidate), ne(project.id, excludeProjectId))
          : eq(project.slug, candidate),
        columns: {
          id: true,
        },
      });

      if (!existing) {
        return candidate;
      }

      candidate = `${slug}-${suffix}`;
      suffix += 1;
    }
  }

  async function getOwnedProject(projectId: string, ownerUserId: string) {
    return database.query.project.findFirst({
      where: and(
        eq(project.id, projectId),
        eq(project.ownerUserId, ownerUserId),
      ),
    });
  }

  async function getOwnedProjectByGithubSource(
    ownerUserId: string,
    input: {
      repositoryUrl: string;
      externalRepoId?: string | null;
    },
  ) {
    const normalizedRepositoryUrl = normalizeRepositoryUrl(input.repositoryUrl);

    if (input.externalRepoId) {
      const projectByExternalRepoId = await database.query.project.findFirst({
        where: and(
          eq(project.ownerUserId, ownerUserId),
          eq(project.provider, "github"),
          eq(project.externalRepoId, input.externalRepoId),
        ),
      });

      if (projectByExternalRepoId) {
        return projectByExternalRepoId;
      }
    }

    return database.query.project.findFirst({
      where: and(
        eq(project.ownerUserId, ownerUserId),
        eq(project.provider, "github"),
        eq(project.repositoryUrl, normalizedRepositoryUrl),
      ),
    });
  }

  return {
    async createProject(ownerUserId: string, input: CreateProjectBody) {
      const baseSlug = slugifyProjectName(input.slug ?? input.name);
      const slug = await ensureUniqueSlug(baseSlug);
      const hasRepositoryUrl = Boolean(input.repositoryUrl);
      const hasLocalWorkspacePath = Boolean(input.localWorkspacePath);
      const provider = hasRepositoryUrl
        ? (input.provider ?? "github")
        : hasLocalWorkspacePath
          ? (input.provider ?? "local_workspace")
          : (input.provider ?? null);

      const [createdProject] = await database
        .insert(project)
        .values({
          name: input.name,
          slug,
          description: input.description ?? null,
          ownerUserId,
          visibility: input.visibility ?? "private",
          defaultBranch: input.defaultBranch ?? null,
          repositoryUrl: input.repositoryUrl
            ? normalizeRepositoryUrl(input.repositoryUrl)
            : null,
          localWorkspacePath: input.localWorkspacePath
            ? normalizeLocalWorkspacePath(input.localWorkspacePath)
            : null,
          provider,
          externalRepoId: input.externalRepoId ?? null,
        })
        .returning();

      return createdProject;
    },

    async listProjects(
      ownerUserId: string,
      options?: { include?: ProjectListInclude[] },
    ) {
      const projects = await database.query.project.findMany({
        where: eq(project.ownerUserId, ownerUserId),
        orderBy: [desc(project.updatedAt), desc(project.createdAt)],
      });

      if (!options?.include?.includes("latestImport") || projects.length === 0) {
        return projects;
      }

      const latestImports = await database.query.projectImport.findMany({
        where: inArray(
          projectImport.projectId,
          projects.map((projectItem) => projectItem.id),
        ),
        orderBy: [desc(projectImport.startedAt), desc(projectImport.createdAt)],
      });

      const latestImportByProjectId = new Map<string, (typeof latestImports)[number]>();

      for (const importItem of latestImports) {
        if (!latestImportByProjectId.has(importItem.projectId)) {
          latestImportByProjectId.set(importItem.projectId, importItem);
        }
      }

      return projects.map((projectItem) => ({
        ...projectItem,
        latestImport: latestImportByProjectId.get(projectItem.id) ?? null,
      }));
    },

    async getProjectById(projectId: string, ownerUserId: string) {
      return getOwnedProject(projectId, ownerUserId);
    },

    async updateProject(
      projectId: string,
      ownerUserId: string,
      input: UpdateProjectBody,
    ) {
      const existingProject = await getOwnedProject(projectId, ownerUserId);

      if (!existingProject) {
        return null;
      }

      const values: Partial<typeof project.$inferInsert> = {};

      if (input.name !== undefined) values.name = input.name;
      if (input.description !== undefined)
        values.description = input.description;
      if (input.visibility !== undefined) values.visibility = input.visibility;
      if (input.defaultBranch !== undefined)
        values.defaultBranch = input.defaultBranch;
      if (input.repositoryUrl !== undefined) {
        values.repositoryUrl = input.repositoryUrl
          ? normalizeRepositoryUrl(input.repositoryUrl)
          : null;
        values.provider = input.repositoryUrl
          ? (input.provider ?? existingProject.provider ?? "github")
          : (input.provider ?? null);
      }
      if (input.localWorkspacePath !== undefined) {
        values.localWorkspacePath = input.localWorkspacePath
          ? normalizeLocalWorkspacePath(input.localWorkspacePath)
          : null;
        if (!input.repositoryUrl && input.localWorkspacePath) {
          values.provider =
            input.provider ?? existingProject.provider ?? "local_workspace";
        }
      } else if (input.provider !== undefined) {
        values.provider = input.provider;
      }
      if (input.externalRepoId !== undefined)
        values.externalRepoId = input.externalRepoId;

      if (input.slug !== undefined) {
        const baseSlug = slugifyProjectName(input.slug);
        values.slug = await ensureUniqueSlug(baseSlug, projectId);
      }

      const [updatedProject] = await database
        .update(project)
        .set(values)
        .where(
          and(eq(project.id, projectId), eq(project.ownerUserId, ownerUserId)),
        )
        .returning();

      return updatedProject;
    },

    async createOrReuseProjectFromGithub(
      ownerUserId: string,
      input: CreateProjectFromGithubBody,
    ) {
      const existingProject = await getOwnedProjectByGithubSource(ownerUserId, {
        repositoryUrl: input.repositoryUrl,
        externalRepoId: input.externalRepoId,
      });
      const normalizedRepositoryUrl = normalizeRepositoryUrl(input.repositoryUrl);

      if (existingProject) {
        const [updatedProject] = await database
          .update(project)
          .set({
            name: input.name ?? existingProject.name,
            description:
              input.description !== undefined
                ? (input.description ?? null)
                : existingProject.description,
            defaultBranch:
              input.defaultBranch !== undefined
                ? (input.defaultBranch ?? null)
                : existingProject.defaultBranch,
            repositoryUrl: normalizedRepositoryUrl,
            provider: "github",
            externalRepoId:
              input.externalRepoId !== undefined
                ? (input.externalRepoId ?? null)
                : existingProject.externalRepoId,
          })
          .where(eq(project.id, existingProject.id))
          .returning();

        return updatedProject ?? existingProject;
      }

      return this.createProject(ownerUserId, {
        name:
          input.name ??
          normalizeRepositoryUrl(input.repositoryUrl)
            .split("/")
            .filter(Boolean)
            .at(-1) ??
          "github-project",
        description: input.description ?? null,
        defaultBranch: input.defaultBranch ?? null,
        repositoryUrl: normalizedRepositoryUrl,
        provider: "github",
        externalRepoId: input.externalRepoId ?? null,
      });
    },

    async createOrReuseProjectFromUpload(
      ownerUserId: string,
      input: {
        name?: string;
        description?: string | null;
        branch?: string | null;
      },
    ) {
      // Uploaded sources always get a fresh project.
      // localWorkspacePath is intentionally omitted here — the controller will
      // promote the extracted zip directly into .codemap-storage and save
      // sourceWorkspacePath on the import record before the worker runs.
      return this.createProject(ownerUserId, {
        name: input.name ?? "uploaded-project",
        description: input.description ?? null,
        defaultBranch: input.branch ?? null,
        provider: "local_workspace",
      });
    },

    async setProjectDefaultBranchIfMissing(projectId: string, branch: string) {
      const normalizedBranch = branch.trim();

      if (!normalizedBranch) {
        return null;
      }

      const [updatedProject] = await database
        .update(project)
        .set({
          defaultBranch: normalizedBranch,
        })
        .where(
          and(
            eq(project.id, projectId),
            isNull(project.defaultBranch),
          ),
        )
        .returning();

      return updatedProject ?? null;
    },

    async deleteProject(projectId: string, ownerUserId: string) {
      const [deletedProject] = await database
        .delete(project)
        .where(
          and(eq(project.id, projectId), eq(project.ownerUserId, ownerUserId)),
        )
        .returning({
          id: project.id,
        });

      return deletedProject ?? null;
    },

    async listProjectImportsWithSource(
      projectId: string,
      ownerUserId: string,
    ) {
      const existingProject = await getOwnedProject(projectId, ownerUserId);

      if (!existingProject) {
        return null;
      }

      return database.query.projectImport.findMany({
        where: and(
          eq(projectImport.projectId, projectId),
          eq(projectImport.sourceAvailable, true),
        ),
        orderBy: [desc(projectImport.completedAt), desc(projectImport.createdAt)],
      });
    },

    async createImport(
      projectId: string,
      ownerUserId: string,
      input: CreateProjectImportBody,
    ) {
      const existingProject = await getOwnedProject(projectId, ownerUserId);

      if (!existingProject) {
        return null;
      }

      const importBranch =
        input.branch ?? existingProject.defaultBranch ?? null;
      const startedAt = new Date();
      const activeImport = await database.query.projectImport.findFirst({
        where: and(
          eq(projectImport.projectId, projectId),
          inArray(projectImport.status, ["pending", "queued", "running"]),
        ),
        columns: {
          id: true,
        },
      });

      if (activeImport) {
        throw new Error("PROJECT_IMPORT_ALREADY_IN_PROGRESS");
      }

      const [createdImport] = await database.transaction(async (tx) => {
        const [newImport] = await tx
          .insert(projectImport)
          .values({
            projectId,
            triggeredByUserId: ownerUserId,
            status: "pending",
            branch: importBranch,
            startedAt,
          })
          .returning();

        await tx
          .update(project)
          .set({
            status: "importing",
            lastImportedAt: startedAt,
          })
          .where(eq(project.id, projectId));

        return [newImport];
      });

      return createdImport;
    },

    async markImportAsQueued(projectImportId: string) {
      const [queuedImport] = await database
        .update(projectImport)
        .set({
          status: "queued",
          errorMessage: null,
        })
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return queuedImport ?? null;
    },

    async markImportAsRunning(
      projectImportId: string,
      options?: { branch?: string | null },
    ) {
      const [runningImport] = await database
        .update(projectImport)
        .set({
          status: "running",
          branch: options?.branch ?? undefined,
          errorMessage: null,
          parseStatus: "pending",
          parseTool: null,
          parseToolVersion: null,
          parseStartedAt: null,
          parseCompletedAt: null,
          parseError: null,
          indexedFileCount: 0,
          indexedSymbolCount: 0,
          indexedEdgeCount: 0,
          parseStatsJson: null,
        })
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return runningImport ?? null;
    },

    async markImportAsCompleted(projectImportId: string) {
      const completedAt = new Date();

      const [completedImport] = await database.transaction(async (tx) => {
        const [updatedImport] = await tx
          .update(projectImport)
          .set({
            status: "completed",
            completedAt,
            errorMessage: null,
          })
          .where(eq(projectImport.id, projectImportId))
          .returning();

        if (!updatedImport) {
          return [null];
        }

        await tx
          .update(project)
          .set({
            status: "importing",
            lastImportedAt: completedAt,
          })
          .where(eq(project.id, updatedImport.projectId));

        return [updatedImport];
      });

      return completedImport;
    },

    async saveImportSourceMetadata(input: {
      projectImportId: string;
      branch?: string | null;
      commitSha: string | null;
      sourceStorageKey: string;
      sourceWorkspacePath: string;
    }) {
      const [updatedImport] = await database
        .update(projectImport)
        .set({
          branch: input.branch ?? undefined,
          commitSha: input.commitSha,
          sourceStorageKey: input.sourceStorageKey,
          sourceWorkspacePath: input.sourceWorkspacePath,
          sourceAvailable: true,
        })
        .where(eq(projectImport.id, input.projectImportId))
        .returning();

      return updatedImport ?? null;
    },

    async clearImportSourceMetadata(projectImportId: string) {
      const [updatedImport] = await database
        .update(projectImport)
        .set({
          sourceStorageKey: null,
          sourceWorkspacePath: null,
          sourceAvailable: false,
        })
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return updatedImport ?? null;
    },

    async markImportAsFailed(projectImportId: string, errorMessage: string) {
      const completedAt = new Date();

      const [failedImport] = await database.transaction(async (tx) => {
        const [updatedImport] = await tx
          .update(projectImport)
          .set({
            status: "failed",
            completedAt,
            errorMessage,
          })
          .where(eq(projectImport.id, projectImportId))
          .returning();

        if (!updatedImport) {
          return [null];
        }

        await tx
          .update(project)
          .set({
            status: "failed",
          })
          .where(eq(project.id, updatedImport.projectId));

        return [updatedImport];
      });

      return failedImport;
    },

    async markParseAsQueued(projectImportId: string) {
      const [updatedImport] = await database
        .update(projectImport)
        .set({
          parseStatus: "queued",
          parseStartedAt: null,
          parseCompletedAt: null,
          parseError: null,
        })
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return updatedImport ?? null;
    },

    async markParseAsRunning(
      projectImportId: string,
      options?: {
        parseTool?: string | null;
        parseToolVersion?: string | null;
      },
    ) {
      const parseStartedAt = new Date();

      const [updatedImport] = await database
        .update(projectImport)
        .set({
          parseStatus: "running",
          parseTool: options?.parseTool ?? undefined,
          parseToolVersion: options?.parseToolVersion ?? undefined,
          parseStartedAt,
          parseCompletedAt: null,
          parseError: null,
          parseStatsJson: null,
          indexedFileCount: 0,
          indexedSymbolCount: 0,
          indexedEdgeCount: 0,
        })
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return updatedImport ?? null;
    },

    async markParseAsCompleted(input: {
      projectImportId: string;
      indexedFileCount: number;
      indexedSymbolCount: number;
      indexedEdgeCount: number;
      parseStatsJson: Record<string, unknown>;
    }) {
      const parseCompletedAt = new Date();

      const [updatedImport] = await database.transaction(async (tx) => {
        const [completedImport] = await tx
          .update(projectImport)
          .set({
            parseStatus: "completed",
            parseCompletedAt,
            parseError: null,
            indexedFileCount: input.indexedFileCount,
            indexedSymbolCount: input.indexedSymbolCount,
            indexedEdgeCount: input.indexedEdgeCount,
            parseStatsJson: input.parseStatsJson,
          })
          .where(eq(projectImport.id, input.projectImportId))
          .returning();

        if (!completedImport) {
          return [null];
        }

        await tx
          .update(project)
          .set({
            status: "ready",
            lastImportedAt: parseCompletedAt,
          })
          .where(eq(project.id, completedImport.projectId));

        return [completedImport];
      });

      return updatedImport ?? null;
    },

    async markParseAsPartial(input: {
      projectImportId: string;
      parseError?: string | null;
      indexedFileCount: number;
      indexedSymbolCount: number;
      indexedEdgeCount: number;
      parseStatsJson: Record<string, unknown>;
    }) {
      const parseCompletedAt = new Date();

      const [updatedImport] = await database.transaction(async (tx) => {
        const [partialImport] = await tx
          .update(projectImport)
          .set({
            parseStatus: "partial",
            parseCompletedAt,
            parseError: input.parseError ?? null,
            indexedFileCount: input.indexedFileCount,
            indexedSymbolCount: input.indexedSymbolCount,
            indexedEdgeCount: input.indexedEdgeCount,
            parseStatsJson: input.parseStatsJson,
          })
          .where(eq(projectImport.id, input.projectImportId))
          .returning();

        if (!partialImport) {
          return [null];
        }

        await tx
          .update(project)
          .set({
            status: "ready",
            lastImportedAt: parseCompletedAt,
          })
          .where(eq(project.id, partialImport.projectId));

        return [partialImport];
      });

      return updatedImport ?? null;
    },

    async markParseAsFailed(projectImportId: string, parseError: string) {
      const parseCompletedAt = new Date();

      const [updatedImport] = await database.transaction(async (tx) => {
        const [failedImport] = await tx
          .update(projectImport)
          .set({
            parseStatus: "failed",
            parseCompletedAt,
            parseError,
          })
          .where(eq(projectImport.id, projectImportId))
          .returning();

        if (!failedImport) {
          return [null];
        }

        await tx
          .update(project)
          .set({
            status: "failed",
          })
          .where(eq(project.id, failedImport.projectId));

        return [failedImport];
      });

      return updatedImport ?? null;
    },

    async resetParseStateForRetry(projectImportId: string) {
      const [updatedImport] = await database
        .update(projectImport)
        .set({
          parseStatus: "pending",
          parseStartedAt: null,
          parseCompletedAt: null,
          parseError: null,
          indexedFileCount: 0,
          indexedSymbolCount: 0,
          indexedEdgeCount: 0,
          parseStatsJson: null,
        })
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return updatedImport ?? null;
    },

    async listImports(projectId: string, ownerUserId: string) {
      const existingProject = await getOwnedProject(projectId, ownerUserId);

      if (!existingProject) {
        return null;
      }

      const imports = await database.query.projectImport.findMany({
        where: eq(projectImport.projectId, projectId),
        orderBy: [desc(projectImport.startedAt), desc(projectImport.createdAt)],
      });

      return imports;
    },

    async getLatestProjectMap(projectId: string, ownerUserId: string) {
      const existingProject = await getOwnedProject(projectId, ownerUserId);

      if (!existingProject) {
        return null;
      }

      const latestMap = await database.query.projectMapSnapshot.findFirst({
        where: eq(projectMapSnapshot.projectId, projectId),
        orderBy: [desc(projectMapSnapshot.createdAt)],
      });

      if (!latestMap) {
        return null;
      }

      return latestMap;
    },

    async getLatestProjectMapWithSource(projectId: string, ownerUserId: string) {
      const existingProject = await getOwnedProject(projectId, ownerUserId);

      if (!existingProject) {
        return null;
      }

      const latestMap = await database.query.projectMapSnapshot.findFirst({
        where: eq(projectMapSnapshot.projectId, projectId),
        orderBy: [desc(projectMapSnapshot.createdAt)],
      });

      if (!latestMap) {
        return null;
      }

      const importRecord = await database.query.projectImport.findFirst({
        where: eq(projectImport.id, latestMap.importId),
      });

      return {
        project: existingProject,
        mapSnapshot: latestMap,
        importRecord: importRecord ?? null,
      };
    },

    async getImportWithProject(projectImportId: string) {
      const importRecord = await database.query.projectImport.findFirst({
        where: eq(projectImport.id, projectImportId),
      });

      if (!importRecord) {
        return null;
      }

      const projectRecord = await database.query.project.findFirst({
        where: eq(project.id, importRecord.projectId),
      });

      if (!projectRecord) {
        return null;
      }

      return {
        importRecord,
        projectRecord,
      };
    },

    async getLatestSuccessfulImportWithSource(
      projectId: string,
      options?: { excludeImportId?: string },
    ) {
      return database.query.projectImport.findFirst({
        where: and(
          eq(projectImport.projectId, projectId),
          eq(projectImport.status, "completed"),
          eq(projectImport.sourceAvailable, true),
          ne(projectImport.parseStatus, "pending"),
          ne(projectImport.parseStatus, "queued"),
          ne(projectImport.parseStatus, "running"),
          options?.excludeImportId
            ? ne(projectImport.id, options.excludeImportId)
            : undefined,
        ),
        orderBy: [desc(projectImport.completedAt), desc(projectImport.createdAt)],
      });
    },

    async listSupersededImportsWithSource(
      projectId: string,
      currentImportId: string,
    ) {
      return database.query.projectImport.findMany({
        where: and(
          eq(projectImport.projectId, projectId),
          ne(projectImport.id, currentImportId),
          eq(projectImport.sourceAvailable, true),
        ),
        orderBy: [desc(projectImport.completedAt), desc(projectImport.createdAt)],
      });
    },

    async deleteSupersededImports(projectId: string, currentImportId: string) {
      const superseded = await database.query.projectImport.findMany({
        where: and(
          eq(projectImport.projectId, projectId),
          ne(projectImport.id, currentImportId),
        ),
        columns: { id: true },
      });

      if (superseded.length === 0) return;

      await database.delete(projectImport).where(
        inArray(
          projectImport.id,
          superseded.map((r) => r.id),
        ),
      );
    },
  };
}
