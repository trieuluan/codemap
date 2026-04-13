import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  enqueueProjectImportJob,
  getProjectImportJob,
} from "../../lib/project-import-queue";
import {
  buildUnavailableFilePreview,
  getProjectFilePreview,
  normalizeRepositoryFilePath,
} from "../project-import/file-preview";
import { createRepositoryWorkspaceService } from "../project-import/repository-workspace";
import {
  findProjectTreeNodeByPath,
  type ProjectTreeNode,
} from "../project-import/tree-builder";
import { createProjectService } from "./service";
import {
  createProjectBodySchema,
  createProjectImportBodySchema,
  listProjectsQuerySchema,
  projectFileContentQuerySchema,
  projectImportParamsSchema,
  projectParamsSchema,
  updateProjectBodySchema,
} from "./schema";

function getAuthenticatedUserId(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const userId = request.session?.user?.id;

  if (!userId) {
    throw fastify.httpErrors.unauthorized("Unauthorized");
  }

  return userId;
}

export function createProjectController(fastify: FastifyInstance) {
  const service = createProjectService(fastify.db);
  const repositoryWorkspaceService = createRepositoryWorkspaceService();

  return {
    createProject: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const body = createProjectBodySchema.parse(request.body);

      const createdProject = await service.createProject(userId, body);

      return reply.success(createdProject, 201);
    },

    listProjects: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const query = listProjectsQuerySchema.parse(request.query ?? {});
      const projects = await service.listProjects(userId, {
        include: query.include,
      });

      return reply.success(projects, 200, {
        count: projects.length,
      });
    },

    getProjectById: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);

      const project = await service.getProjectById(projectId, userId);

      if (!project) {
        throw fastify.httpErrors.notFound("Project not found");
      }

      return reply.success(project);
    },

    updateProject: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = updateProjectBodySchema.parse(request.body);

      const project = await service.updateProject(projectId, userId, body);

      if (!project) {
        throw fastify.httpErrors.notFound("Project not found");
      }

      return reply.success(project);
    },

    deleteProject: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const retainedImports = await service.listProjectImportsWithSource(
        projectId,
        userId,
      );

      const deletedProject = await service.deleteProject(projectId, userId);

      if (!deletedProject) {
        throw fastify.httpErrors.notFound("Project not found");
      }

      for (const importRecord of retainedImports ?? []) {
        try {
          await repositoryWorkspaceService.removeWorkspaceByPath(
            importRecord.sourceWorkspacePath,
          );
        } catch (error) {
          request.log.error(
            { error, projectId, importId: importRecord.id },
            "Failed to delete retained repository workspace during project deletion",
          );
        }
      }

      return reply.success({
        id: deletedProject.id,
        deleted: true,
      });
    },

    createImport: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const body = createProjectImportBodySchema.parse(request.body ?? {});

      let createdImport;

      try {
        createdImport = await service.createImport(projectId, userId, body);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "PROJECT_IMPORT_ALREADY_IN_PROGRESS"
        ) {
          throw fastify.httpErrors.conflict(
            "An import is already queued or running for this project",
          );
        }

        throw error;
      }

      if (!createdImport) {
        throw fastify.httpErrors.notFound("Project not found");
      }

      try {
        await enqueueProjectImportJob(fastify.redis, {
          importId: createdImport.id,
        });
      } catch (error) {
        request.log.error(error, "Failed to enqueue project import job");

        await service.markImportAsFailed(
          createdImport.id,
          "Unable to enqueue import job",
        );

        throw fastify.httpErrors.internalServerError(
          "Unable to start import job",
        );
      }

      return reply.success(createdImport, 201);
    },

    retryImport: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId, importId } = projectImportParamsSchema.parse(
        request.params,
      );

      const existingImport = await service.getImportById(
        projectId,
        importId,
        userId,
      );

      if (!existingImport) {
        throw fastify.httpErrors.notFound("Project import not found");
      }

      if (
        existingImport.importRecord.status === "pending" ||
        existingImport.importRecord.status === "running"
      ) {
        const existingJob = await getProjectImportJob(fastify.redis, importId);
        const existingJobState = existingJob
          ? await existingJob.getState()
          : null;

        if (
          existingJobState &&
          ["waiting", "active", "delayed", "prioritized"].includes(
            existingJobState,
          )
        ) {
          throw fastify.httpErrors.conflict(
            "This import job is still active and cannot be restarted yet",
          );
        }

        await service.markImportAsFailed(
          importId,
          "Import was restarted after the previous job stopped unexpectedly",
        );
      }

      let retriedImport;

      try {
        retriedImport = await service.retryImport(projectId, importId, userId);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "PROJECT_IMPORT_ALREADY_IN_PROGRESS"
        ) {
          throw fastify.httpErrors.conflict(
            "An import is already queued or running for this project",
          );
        }

        throw error;
      }

      if (!retriedImport?.createdImport) {
        throw fastify.httpErrors.notFound("Project import not found");
      }

      try {
        await enqueueProjectImportJob(fastify.redis, {
          importId: retriedImport.createdImport.id,
        });
      } catch (error) {
        request.log.error(
          error,
          "Failed to enqueue retried project import job",
        );

        await service.markImportAsFailed(
          retriedImport.createdImport.id,
          "Unable to restart import job",
        );

        throw fastify.httpErrors.internalServerError(
          "Unable to restart import job",
        );
      }

      return reply.success(retriedImport.createdImport, 201);
    },

    listImports: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);

      const imports = await service.listImports(projectId, userId);

      if (!imports) {
        throw fastify.httpErrors.notFound("Project not found");
      }

      return reply.success(imports, 200, {
        count: imports.length,
      });
    },

    getProjectMap: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const latestMap = await service.getLatestProjectMap(projectId, userId);

      if (!latestMap) {
        throw fastify.httpErrors.notFound("Project map not found");
      }

      return reply.success({
        id: latestMap.id,
        projectId: latestMap.projectId,
        importId: latestMap.importId,
        tree: latestMap.treeJson,
        createdAt: latestMap.createdAt,
        updatedAt: latestMap.updatedAt,
      });
    },

    getProjectFileContent: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const query = projectFileContentQuerySchema.parse(request.query ?? {});

      let normalizedPath: string;

      try {
        normalizedPath = normalizeRepositoryFilePath(query.path);
      } catch (error) {
        throw fastify.httpErrors.badRequest(
          error instanceof Error ? error.message : "Invalid file path",
        );
      }

      const latestMapWithSource = await service.getLatestProjectMapWithSource(
        projectId,
        userId,
      );

      if (!latestMapWithSource) {
        throw fastify.httpErrors.notFound("Project map not found");
      }

      const treeNode = findProjectTreeNodeByPath(
        latestMapWithSource.mapSnapshot.treeJson as ProjectTreeNode,
        normalizedPath,
      );

      if (!treeNode) {
        return reply.success(
          buildUnavailableFilePreview({
            path: normalizedPath,
            reason:
              "This file is not present in the latest project map snapshot.",
          }),
        );
      }

      if (
        !latestMapWithSource.importRecord?.sourceAvailable ||
        !latestMapWithSource.importRecord.sourceWorkspacePath
      ) {
        return reply.success(
          buildUnavailableFilePreview({
            path: normalizedPath,
            name: treeNode.name,
            extension: treeNode.extension,
            reason:
              "Retained source is not available for the latest successful import.",
          }),
        );
      }

      const preview = await getProjectFilePreview({
        workspacePath: latestMapWithSource.importRecord.sourceWorkspacePath,
        treeNode,
      });

      return reply.success(preview);
    },
  };
}
