import { and, count, desc, eq, inArray } from "drizzle-orm";
import { project, projectImport, workspace } from "../../db/schema";
import { createWorkspaceService } from "../workspace/service";
import type {
  CreateProjectBody,
  CreateProjectImportBody,
  UpdateProjectBody,
} from "./schema";
import {
  type Database,
  type ProjectImportRecord,
  ensureUniqueSlug,
  normalizeLocalWorkspacePath,
  normalizeRepositoryUrl,
  slugifyProjectName,
  withCommitMessages,
} from "./service.shared";

export function createAdminProjectService(database: Database) {
  const workspaceService = createWorkspaceService(database);

  return {
    async createProject(adminUserId: string, input: CreateProjectBody) {
      const workspace = await workspaceService.ensurePersonalWorkspace(adminUserId);

      const baseSlug = slugifyProjectName(input.slug ?? input.name);
      const slug = await ensureUniqueSlug(database, baseSlug);

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
          ownerUserId: adminUserId,
          workspaceId: workspace.id,
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

      await workspaceService.recordUsageEvent({
        workspaceId: workspace.id,
        projectId: createdProject.id,
        userId: adminUserId,
        type: "project_created",
      });

      return createdProject;
    },

    async listProjects(options?: { workspaceId?: string; ownerUserId?: string }) {
      const where = options?.workspaceId
        ? eq(project.workspaceId, options.workspaceId)
        : options?.ownerUserId
          ? eq(project.ownerUserId, options.ownerUserId)
          : undefined;

      const projects = await database.query.project.findMany({
        where,
        orderBy: [desc(project.updatedAt), desc(project.createdAt)],
      });

      const latestImports = projects.length
        ? await database.query.projectImport.findMany({
            where: inArray(
              projectImport.projectId,
              projects.map((p) => p.id),
            ),
            orderBy: [desc(projectImport.startedAt), desc(projectImport.createdAt)],
          })
        : [];

      const latestImportByProjectId = new Map<string, (typeof latestImports)[number]>();
      for (const imp of latestImports) {
        if (!latestImportByProjectId.has(imp.projectId)) {
          latestImportByProjectId.set(imp.projectId, imp);
        }
      }

      return projects.map((p) => ({
        ...p,
        latestImport: latestImportByProjectId.get(p.id) ?? null,
      }));
    },

    async getProject(projectId: string) {
      return database.query.project.findFirst({
        where: eq(project.id, projectId),
      }) ?? null;
    },

    async updateProject(projectId: string, input: UpdateProjectBody) {
      const existing = await database.query.project.findFirst({
        where: eq(project.id, projectId),
      });

      if (!existing) return null;

      const values: Partial<typeof project.$inferInsert> = {};

      if (input.name !== undefined) values.name = input.name;
      if (input.description !== undefined) values.description = input.description;
      if (input.visibility !== undefined) values.visibility = input.visibility;
      if (input.defaultBranch !== undefined) values.defaultBranch = input.defaultBranch;
      if (input.repositoryUrl !== undefined) {
        values.repositoryUrl = input.repositoryUrl
          ? normalizeRepositoryUrl(input.repositoryUrl)
          : null;
        values.provider = input.repositoryUrl
          ? (input.provider ?? existing.provider ?? "github")
          : (input.provider ?? null);
      }
      if (input.localWorkspacePath !== undefined) {
        values.localWorkspacePath = input.localWorkspacePath
          ? normalizeLocalWorkspacePath(input.localWorkspacePath)
          : null;
        if (!input.repositoryUrl && input.localWorkspacePath) {
          values.provider = input.provider ?? existing.provider ?? "local_workspace";
        }
      } else if (input.provider !== undefined) {
        values.provider = input.provider;
      }
      if (input.externalRepoId !== undefined) values.externalRepoId = input.externalRepoId;
      if (input.slug !== undefined) {
        values.slug = await ensureUniqueSlug(database, slugifyProjectName(input.slug), projectId);
      }

      const [updated] = await database
        .update(project)
        .set(values)
        .where(eq(project.id, projectId))
        .returning();

      return updated ?? null;
    },

    async deleteProject(projectId: string) {
      const [deleted] = await database
        .delete(project)
        .where(eq(project.id, projectId))
        .returning({ id: project.id });

      return deleted ?? null;
    },

    async createImport(
      projectId: string,
      adminUserId: string,
      input: CreateProjectImportBody,
    ) {
      const existingProject = await database.query.project.findFirst({
        where: eq(project.id, projectId),
      });

      if (!existingProject) {
        return null;
      }

      const workspaceId =
        existingProject.workspaceId ??
        (await workspaceService.ensurePersonalWorkspace(existingProject.ownerUserId)).id;
      const targetWorkspace = await database.query.workspace.findFirst({
        where: eq(workspace.id, workspaceId),
      });
      const entitlements = workspaceService.getWorkspaceEntitlements(
        targetWorkspace ?? { plan: "beta" },
      );
      const usage = await workspaceService.getUsageSummary(workspaceId);
      workspaceService.assertCanTriggerImport(entitlements, usage);

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

      const importBranch = input.branch ?? existingProject.defaultBranch ?? null;
      const startedAt = new Date();

      const [createdImport] = await database.transaction(async (tx) => {
        const [newImport] = await tx
          .insert(projectImport)
          .values({
            projectId,
            triggeredByUserId: adminUserId,
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

      await workspaceService.recordUsageEvent({
        workspaceId,
        projectId,
        userId: adminUserId,
        type: "import_triggered",
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

    async markImportAsFailed(projectImportId: string, errorMessage: string) {
      const [failedImport] = await database
        .update(projectImport)
        .set({
          status: "failed",
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(projectImport.id, projectImportId))
        .returning();

      return failedImport ?? null;
    },

    async listProjectImports(
      projectId: string,
      options?: { page?: number; pageSize?: number },
    ) {
      const existingProject = await database.query.project.findFirst({
        where: eq(project.id, projectId),
      });

      if (!existingProject) {
        return null;
      }

      const page = options?.page ?? 1;
      const pageSize = options?.pageSize ?? 15;
      const offset = (page - 1) * pageSize;

      const [imports, totalRows] = await Promise.all([
        database.query.projectImport.findMany({
          where: eq(projectImport.projectId, projectId),
          orderBy: [desc(projectImport.startedAt), desc(projectImport.createdAt)],
          limit: pageSize,
          offset,
        }),
        database
          .select({ value: count() })
          .from(projectImport)
          .where(eq(projectImport.projectId, projectId)),
      ]);

      const items = await withCommitMessages(imports as ProjectImportRecord[]);
      const total = totalRows[0]?.value ?? 0;

      return {
        items,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    },
  };
}
