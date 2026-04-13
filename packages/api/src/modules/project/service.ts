import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { db } from "../../db";
import { project, projectImport, projectMapSnapshot } from "../../db/schema";
import type {
  CreateProjectBody,
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

  async function getOwnedImport(
    projectId: string,
    projectImportId: string,
    ownerUserId: string,
  ) {
    const existingProject = await getOwnedProject(projectId, ownerUserId);

    if (!existingProject) {
      return null;
    }

    const existingImport = await database.query.projectImport.findFirst({
      where: and(
        eq(projectImport.id, projectImportId),
        eq(projectImport.projectId, projectId),
      ),
    });

    if (!existingImport) {
      return null;
    }

    return {
      project: existingProject,
      importRecord: existingImport,
    };
  }

  return {
    async createProject(ownerUserId: string, input: CreateProjectBody) {
      const baseSlug = slugifyProjectName(input.slug ?? input.name);
      const slug = await ensureUniqueSlug(baseSlug);
      const hasRepositoryUrl = Boolean(input.repositoryUrl);
      const provider = hasRepositoryUrl
        ? (input.provider ?? "github")
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
          repositoryUrl: input.repositoryUrl ?? null,
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
        values.repositoryUrl = input.repositoryUrl;
        values.provider = input.repositoryUrl
          ? (input.provider ?? existingProject.provider ?? "github")
          : (input.provider ?? null);
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
          inArray(projectImport.status, ["pending", "running"]),
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

    async retryImport(
      projectId: string,
      projectImportId: string,
      ownerUserId: string,
    ) {
      const ownedImport = await getOwnedImport(
        projectId,
        projectImportId,
        ownerUserId,
      );

      if (!ownedImport) {
        return null;
      }

      return {
        sourceImport: ownedImport.importRecord,
        createdImport: await this.createImport(projectId, ownerUserId, {
          branch: ownedImport.importRecord.branch ?? undefined,
        }),
      };
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
            status: "ready",
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
      commitSha: string;
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

    async getImportById(
      projectId: string,
      projectImportId: string,
      ownerUserId: string,
    ) {
      return getOwnedImport(projectId, projectImportId, ownerUserId);
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
          options?.excludeImportId
            ? ne(projectImport.id, options.excludeImportId)
            : undefined,
        ),
        orderBy: [desc(projectImport.completedAt), desc(projectImport.createdAt)],
      });
    },
  };
}
