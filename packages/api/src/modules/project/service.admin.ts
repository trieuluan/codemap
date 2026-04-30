import { desc, eq, inArray } from "drizzle-orm";
import { project, projectImport } from "../../db/schema";
import { createWorkspaceService } from "../workspace/service";
import type { CreateProjectBody, UpdateProjectBody } from "./schema";
import {
  type Database,
  ensureUniqueSlug,
  normalizeLocalWorkspacePath,
  normalizeRepositoryUrl,
  slugifyProjectName,
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
  };
}
