import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { enqueueProjectImportJob } from "../../lib/project-import-queue";
import { createProjectService } from "./service";
import {
  createProjectBodySchema,
  createProjectImportBodySchema,
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

  return {
    createProject: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const body = createProjectBodySchema.parse(request.body);

      const createdProject = await service.createProject(userId, body);

      return reply.success(createdProject, 201);
    },

    listProjects: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const projects = await service.listProjects(userId);

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

      const deletedProject = await service.deleteProject(projectId, userId);

      if (!deletedProject) {
        throw fastify.httpErrors.notFound("Project not found");
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
        await enqueueProjectImportJob({
          importId: createdImport.id,
          projectId: createdImport.projectId,
        });
        const queuedImport = await service.markImportAsQueued(createdImport.id);
        createdImport = queuedImport ?? createdImport;
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
  };
}
