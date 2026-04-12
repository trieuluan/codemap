import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { db } from "../../db";
import { project, projectImport } from "../../db/schema";
import type {
  CreateProjectBody,
  CreateProjectImportBody,
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
      where: and(eq(project.id, projectId), eq(project.ownerUserId, ownerUserId)),
    });
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

    async listProjects(ownerUserId: string) {
      return database.query.project.findMany({
        where: eq(project.ownerUserId, ownerUserId),
        orderBy: [desc(project.updatedAt), desc(project.createdAt)],
      });
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
      if (input.description !== undefined) values.description = input.description;
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
        .where(and(eq(project.id, projectId), eq(project.ownerUserId, ownerUserId)))
        .returning();

      return updatedProject;
    },

    async deleteProject(projectId: string, ownerUserId: string) {
      const [deletedProject] = await database
        .delete(project)
        .where(and(eq(project.id, projectId), eq(project.ownerUserId, ownerUserId)))
        .returning({
          id: project.id,
        });

      return deletedProject ?? null;
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

      const importBranch = input.branch ?? existingProject.defaultBranch ?? null;
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

    async markImportAsQueued(projectImportId: string) {
      const [queuedImport] = await database
        .update(projectImport)
        .set({
          status: "pending",
          errorMessage: null,
        })
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return queuedImport ?? null;
    },

    async markImportAsRunning(projectImportId: string) {
      const [runningImport] = await database
        .update(projectImport)
        .set({
          status: "running",
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
  };
}
