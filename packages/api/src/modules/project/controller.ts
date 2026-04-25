import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { enqueueProjectImportJob } from "../../lib/project-import-queue";
import {
  buildUnavailableFilePreview,
  createProjectRawImageReadStream,
  getProjectFilePreview,
  getProjectRawImageFile,
  normalizeRepositoryFilePath,
} from "./map/file-preview";
import { createRepositoryWorkspaceService } from "./import/repository-workspace";
import {
  findProjectTreeNodeByPath,
  type ProjectTreeNode,
} from "./map/tree-builder";
import { createRepoParseGraphService } from "./parse/repo-parse-graph";
import { createProjectService } from "./service";
import { getProjectGitDiff } from "./map/git-diff";
import { reparseFileIfStale } from "./parse/file-reparse.service";
import {
  createProjectBodySchema,
  createProjectFromGithubBodySchema,
  createProjectImportBodySchema,
  listProjectsQuerySchema,
  projectFileContentQuerySchema,
  projectFileReparseBodySchema,
  projectMapDiffQuerySchema,
  projectMapSearchQuerySchema,
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

  async function enqueueImportOrFail(
    request: FastifyRequest,
    projectImportId: string,
  ) {
    try {
      await enqueueProjectImportJob(fastify.redis, {
        importId: projectImportId,
      });
    } catch (error) {
      request.log.error(error, "Failed to enqueue project import job");

      await service.markImportAsFailed(
        projectImportId,
        "Unable to enqueue import job",
      );

      throw fastify.httpErrors.internalServerError(
        "Unable to start import job",
      );
    }

    return service.markImportAsQueued(projectImportId);
  }

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

      const queuedImport = await enqueueImportOrFail(request, createdImport.id);

      return reply.success(queuedImport ?? createdImport, 201);
    },

    createProjectFromGithub: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const body = createProjectFromGithubBodySchema.parse(request.body ?? {});
      const project = await service.createOrReuseProjectFromGithub(
        userId,
        body,
      );

      let createdImport;

      try {
        createdImport = await service.createImport(project.id, userId, {
          branch: body.branch,
        });
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
        throw fastify.httpErrors.internalServerError(
          "Unable to create project import",
        );
      }

      const queuedImport = await enqueueImportOrFail(request, createdImport.id);

      return reply.success(
        {
          project,
          import: queuedImport ?? createdImport,
        },
        201,
      );
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
        startLine: query.startLine,
        endLine: query.endLine,
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
          importedBy: [],
          exports: [],
          symbols: [],
          blastRadius: {
            totalCount: 0,
            directCount: 0,
            maxDepth: 0,
            hasCycles: false,
            files: [],
          },
        });
      }

      const [imports, importedBy, exportsToReturn, symbols, { blastRadius, cycles }] =
        await Promise.all([
          repoParseGraphService.listFileImportEdges(
            importRecord.id,
            fileRecord.id,
          ),
          repoParseGraphService.listFileIncomingImportEdges(
            importRecord.id,
            fileRecord.id,
          ),
          repoParseGraphService.listExports(importRecord.id, fileRecord.id),
          repoParseGraphService.listFileSymbols(importRecord.id, fileRecord.id),
          repoParseGraphService.getFileAnalysis(
            importRecord.id,
            fileRecord.id,
          ),
        ]);
      const symbolById = new Map(symbols.map((item) => [item.id, item]));

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
        importedBy: importedBy.map((item) => ({
          id: item.id,
          sourceFileId: item.sourceFileId,
          sourceFilePath: item.sourceFilePath,
          moduleSpecifier: item.moduleSpecifier,
          importKind: item.importKind,
          resolutionKind: item.resolutionKind,
          startLine: item.startLine,
          startCol: item.startCol + 1,
          endLine: item.endLine,
          endCol: item.endCol + 1,
        })),
        exports: exportsToReturn.map((item) => ({
          symbolId: item.symbolId,
          id: item.id,
          exportName: item.exportName,
          exportKind: item.exportKind,
          symbolDisplayName: item.symbolDisplayName,
          sourceModuleSpecifier: item.sourceModuleSpecifier,
          symbolStartLine: item.symbolId
            ? (symbolById.get(item.symbolId)?.startLine ?? null)
            : null,
          symbolStartCol: item.symbolId
            ? (symbolById.get(item.symbolId)?.startCol ?? null) === null
              ? null
              : (symbolById.get(item.symbolId)?.startCol ?? 0) + 1
            : null,
          symbolEndLine: item.symbolId
            ? (symbolById.get(item.symbolId)?.endLine ?? null)
            : null,
          symbolEndCol: item.symbolId
            ? (symbolById.get(item.symbolId)?.endCol ?? null) === null
              ? null
              : (symbolById.get(item.symbolId)?.endCol ?? 0) + 1
            : null,
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
        blastRadius,
        cycles,
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

    getProjectInsights: async (
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

      const importId = latestMapWithSource.importRecord.id;
      const cacheKey = `insights:${importId}`;
      const cached = await fastify.redis.get(cacheKey);

      if (cached) {
        return reply.success(JSON.parse(cached));
      }

      const insights = await repoParseGraphService.getProjectInsights(importId);
      await fastify.redis.set(cacheKey, JSON.stringify(insights), "EX", 86400);

      return reply.success(insights);
    },

    getProjectGraph: async (request: FastifyRequest, reply: FastifyReply) => {
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

      const graph = await repoParseGraphService.getProjectGraph(
        latestMapWithSource.importRecord.id,
      );

      return reply.success(graph);
    },

    searchProjectMap: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const query = projectMapSearchQuerySchema.parse(request.query ?? {});
      const normalizedQuery = query.q.trim();

      if (normalizedQuery.length < 2) {
        return reply.success({
          files: [],
          symbols: [],
          exports: [],
        });
      }

      const latestMapWithSource = await service.getLatestProjectMapWithSource(
        projectId,
        userId,
      );

      if (!latestMapWithSource?.importRecord) {
        return reply.success({
          files: [],
          symbols: [],
          exports: [],
        });
      }

      const results = await repoParseGraphService.searchProjectMap(
        latestMapWithSource.importRecord.id,
        normalizedQuery,
        query.symbolKinds,
      );

      return reply.success({
        files: results.files,
        symbols: results.symbols.map((item) => ({
          ...item,
          startCol: item.startCol === null ? null : item.startCol + 1,
          endCol: item.endCol === null ? null : item.endCol + 1,
        })),
        exports: results.exports.map((item) => ({
          ...item,
          symbolStartCol:
            item.symbolStartCol === null ? null : item.symbolStartCol + 1,
          symbolEndCol:
            item.symbolEndCol === null ? null : item.symbolEndCol + 1,
          startCol: item.startCol + 1,
          endCol: item.endCol + 1,
        })),
      });
    },

    getProjectDiff: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const query = projectMapDiffQuerySchema.parse(request.query ?? {});

      const latestMapWithSource = await service.getLatestProjectMapWithSource(
        projectId,
        userId,
      );

      if (!latestMapWithSource) {
        throw fastify.httpErrors.notFound("Project map not found");
      }

      const importRecord = latestMapWithSource.importRecord;

      if (
        !importRecord?.sourceAvailable ||
        !importRecord.sourceWorkspacePath
      ) {
        throw fastify.httpErrors.unprocessableEntity(
          "Retained source is not available for this project. Re-import to restore workspace access.",
        );
      }

      try {
        const result = await getProjectGitDiff({
          workspacePath: importRecord.sourceWorkspacePath,
          from: query.from,
          to: query.to,
          includePatch: query.includePatch,
        });

        return reply.success(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (
          message.includes("unknown revision") ||
          message.includes("bad revision") ||
          message.includes("ambiguous argument")
        ) {
          throw fastify.httpErrors.badRequest(
            `Invalid commit reference: ${message}`,
          );
        }

        throw error;
      }
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

    reparseProjectFile: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const { path: filePath, content, contentHash } =
        projectFileReparseBodySchema.parse(request.body);

      const normalizedPath = (() => {
        try {
          return normalizeRepositoryFilePath(filePath);
        } catch {
          throw fastify.httpErrors.badRequest("Invalid file path");
        }
      })();

      const latestMapWithSource = await service.getLatestProjectMapWithSource(
        projectId,
        userId,
      );

      if (!latestMapWithSource?.importRecord) {
        throw fastify.httpErrors.notFound("Project map not found");
      }

      const { importRecord } = latestMapWithSource;

      const fileRecord = await repoParseGraphService.getFileByPath(
        importRecord.id,
        normalizedPath,
      );

      if (!fileRecord) {
        throw fastify.httpErrors.notFound(
          `File not found in project: ${normalizedPath}`,
        );
      }

      const result = await reparseFileIfStale(
        fastify.db,
        importRecord,
        fileRecord,
        content,
        contentHash,
      );

      return reply.success(result);
    },

  };
}
