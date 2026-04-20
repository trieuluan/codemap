import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { enqueueProjectImportJob } from "../../lib/project-import-queue";
import {
  buildUnavailableFilePreview,
  createProjectRawImageReadStream,
  getProjectFilePreview,
  getProjectRawImageFile,
  normalizeRepositoryFilePath,
} from "../project-import/file-preview";
import { createRepositoryWorkspaceService } from "../project-import/repository-workspace";
import {
  findProjectTreeNodeByPath,
  type ProjectTreeNode,
} from "../project-import/tree-builder";
import { createRepoParseGraphService } from "../project-import/repo-parse-graph";
import { createProjectService } from "./service";
import {
  createProjectBodySchema,
  createProjectImportBodySchema,
  listProjectsQuerySchema,
  projectFileContentQuerySchema,
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
  const repoParseGraphService = createRepoParseGraphService(fastify.db);
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

    getProjectFileParseData: async (
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
        throw fastify.httpErrors.notFound(
          "This file is not present in the latest project map snapshot.",
        );
      }

      const importRecord = latestMapWithSource.importRecord;

      if (!importRecord) {
        throw fastify.httpErrors.notFound("Project import not found");
      }

      const fileRecord = await repoParseGraphService.getFileByPath(
        importRecord.id,
        normalizedPath,
      );

      if (!fileRecord) {
        return reply.success({
          file: {
            fileId: null,
            path: normalizedPath,
            language: null,
            lineCount: null,
            parseStatus: "unavailable",
            sizeBytes: null,
            mimeType: null,
            extension: treeNode.extension ?? null,
            importParseStatus: importRecord.parseStatus,
          },
          imports: [],
          exports: [],
          symbols: [],
        });
      }

      const [imports, exportsToReturn, symbols] = await Promise.all([
        repoParseGraphService.listFileImportEdges(importRecord.id, fileRecord.id),
        repoParseGraphService.listExports(importRecord.id, fileRecord.id),
        repoParseGraphService.listFileSymbols(importRecord.id, fileRecord.id),
      ]);

      return reply.success({
        file: {
          fileId: fileRecord.id,
          path: fileRecord.path,
          language: fileRecord.language,
          lineCount: fileRecord.lineCount,
          parseStatus: fileRecord.parseStatus,
          sizeBytes: fileRecord.sizeBytes ?? null,
          mimeType: fileRecord.mimeType,
          extension: fileRecord.extension,
          importParseStatus: importRecord.parseStatus,
        },
        imports: imports.map((item) => ({
          id: item.id,
          moduleSpecifier: item.moduleSpecifier,
          importKind: item.importKind,
          isResolved: item.isResolved,
          resolutionKind: item.resolutionKind,
          targetPathText: item.targetPathText ?? item.targetFilePath,
          targetExternalSymbolKey: item.targetExternalSymbolKey,
          startLine: item.startLine,
          startCol: item.startCol + 1,
          endLine: item.endLine,
          endCol: item.endCol + 1,
        })),
        exports: exportsToReturn.map((item) => ({
          id: item.id,
          exportName: item.exportName,
          exportKind: item.exportKind,
          symbolDisplayName: item.symbolDisplayName,
          sourceModuleSpecifier: item.sourceModuleSpecifier,
          startLine: item.startLine,
          startCol: item.startCol + 1,
          endLine: item.endLine,
          endCol: item.endCol + 1,
        })),
        symbols: symbols.map((item) => ({
          ...item,
          startCol: item.startCol === null ? null : item.startCol + 1,
          endCol: item.endCol === null ? null : item.endCol + 1,
        })),
      });
    },

    getProjectAnalysis: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const latestMapWithSource = await service.getLatestProjectMapWithSource(
        projectId,
        userId,
      );

      if (!latestMapWithSource) {
        throw fastify.httpErrors.notFound("Project map not found");
      }

      if (!latestMapWithSource.importRecord) {
        throw fastify.httpErrors.notFound("Project import not found");
      }

      const summary = await repoParseGraphService.getProjectAnalysisSummary(
        latestMapWithSource.importRecord.id,
      );

      return reply.success(summary);
    },

    getProjectRawFile: async (request: FastifyRequest, reply: FastifyReply) => {
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
        throw fastify.httpErrors.notFound(
          "This file is not present in the latest project map snapshot.",
        );
      }

      if (
        !latestMapWithSource.importRecord?.sourceAvailable ||
        !latestMapWithSource.importRecord.sourceWorkspacePath
      ) {
        throw fastify.httpErrors.notFound(
          "Retained source is not available for the latest successful import.",
        );
      }

      try {
        const rawImageFile = await getProjectRawImageFile({
          workspacePath: latestMapWithSource.importRecord.sourceWorkspacePath,
          treeNode,
        });

        reply.header("cache-control", "no-store");
        reply.header("Cross-Origin-Resource-Policy", "cross-origin");
        reply.type(rawImageFile.mimeType);

        return reply.send(
          createProjectRawImageReadStream(rawImageFile.absoluteFilePath),
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          throw fastify.httpErrors.notFound(
            "This file is not available in the retained repository workspace.",
          );
        }

        const message =
          error instanceof Error
            ? error.message
            : "File preview is unavailable";

        if (message.includes("too large")) {
          throw fastify.httpErrors.badRequest(message);
        }

        if (
          message.includes("previewable image") ||
          message.includes("Directories cannot") ||
          message.includes("Only regular files")
        ) {
          throw fastify.httpErrors.badRequest(message);
        }

        throw error;
      }
    },
  };
}
