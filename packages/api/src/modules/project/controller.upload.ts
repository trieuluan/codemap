import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { enqueueProjectImportJob } from "../../lib/project-import-queue";
import { createProjectService } from "./service";
import { createProjectFromUploadQuerySchema } from "./schema.upload";
import { extractAndPrepareUploadSource } from "./import/source/upload-source";

function getAuthenticatedUserId(
  fastify: FastifyInstance,
  request: FastifyRequest,
) {
  const userId = request.session?.user?.id;
  if (!userId) throw fastify.httpErrors.unauthorized("Unauthorized");
  return userId;
}

export function createProjectUploadController(fastify: FastifyInstance) {
  const service = createProjectService(fastify.db);

  return {
    createProjectFromUpload: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const query = createProjectFromUploadQuerySchema.parse(
        request.query ?? {},
      );

      const zipBuffer = request.body as Buffer;

      if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
        throw fastify.httpErrors.badRequest(
          "Request body must be a non-empty zip file",
        );
      }

      let prepared;

      try {
        prepared = await extractAndPrepareUploadSource(zipBuffer, {
          repoName: query.name,
        });
      } catch (error) {
        throw fastify.httpErrors.badRequest(
          `Failed to extract uploaded zip: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      let project;

      try {
        project = await service.createOrReuseProjectFromUpload(userId, {
          name: query.name,
          description: query.description,
          localWorkspacePath: prepared.workspacePath,
          branch: query.branch ?? null,
        });
      } catch (error) {
        await prepared.cleanup();
        throw error;
      }

      let createdImport;

      try {
        createdImport = await service.createImport(project.id, userId, {
          branch: query.branch ?? null,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "PROJECT_IMPORT_ALREADY_IN_PROGRESS"
        ) {
          await prepared.cleanup();
          throw fastify.httpErrors.conflict(
            "An import is already queued or running for this project",
          );
        }

        await prepared.cleanup();
        throw error;
      }

      if (!createdImport) {
        await prepared.cleanup();
        throw fastify.httpErrors.internalServerError(
          "Unable to create project import",
        );
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
        await prepared.cleanup();
        throw fastify.httpErrors.internalServerError(
          "Unable to start import job",
        );
      }

      return reply.success(
        {
          project,
          import: createdImport,
          uploadStats: {
            removedSensitiveFiles: prepared.removedSensitiveFiles,
          },
        },
        201,
      );
    },
  };
}
