import path from "node:path";
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
import {
  buildFileSha256,
  inferLanguage,
  inferMimeType,
  loadTypeScriptResolverConfigs,
  normalizeExtension,
  parseWorkspaceFileSemantics,
  type WorkspaceFileCandidate,
} from "./parse/runner";
import { createRepoParseGraphService } from "./parse/repo-parse-graph";
import { createProjectService } from "./service";
import {
  createProjectBodySchema,
  createProjectFromGithubBodySchema,
  createProjectImportBodySchema,
  listProjectsQuerySchema,
  projectFileContentQuerySchema,
  projectFileSyncBodySchema,
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

      await enqueueImportOrFail(request, createdImport.id);

      return reply.success(createdImport, 201);
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

      await enqueueImportOrFail(request, createdImport.id);

      return reply.success(
        {
          project,
          import: createdImport,
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

      const insights = await repoParseGraphService.getProjectInsights(
        latestMapWithSource.importRecord.id,
      );

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

    syncProjectFile: async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const userId = getAuthenticatedUserId(fastify, request);
      const { projectId } = projectParamsSchema.parse(request.params);
      const { path: filePath, content, localUpdatedAt } =
        projectFileSyncBodySchema.parse(request.body);

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

      if (!latestMapWithSource) {
        throw fastify.httpErrors.notFound("Project map not found");
      }

      const { importRecord } = latestMapWithSource;

      if (!importRecord) {
        throw fastify.httpErrors.notFound("Project import not found");
      }

      const fileRecord = await repoParseGraphService.getFileByPath(
        importRecord.id,
        normalizedPath,
      );

      if (!fileRecord) {
        throw fastify.httpErrors.notFound(
          `File not found in project: ${normalizedPath}`,
        );
      }

      // Skip sync if BE already has fresher data than the local file
      if (localUpdatedAt) {
        const localTime = new Date(localUpdatedAt).getTime();
        const dbTime = fileRecord.updatedAt.getTime();
        if (dbTime >= localTime) {
          return reply.success({
            synced: false,
            reason: "already_fresh",
            updatedAt: fileRecord.updatedAt.toISOString(),
          });
        }
      }

      // Build the file candidate needed by the parser
      const ext = normalizeExtension(path.basename(normalizedPath));
      const language = fileRecord.language ?? inferLanguage(ext);

      if (!language) {
        throw fastify.httpErrors.badRequest(
          `File type not supported for parsing: ${normalizedPath}`,
        );
      }

      // Load all known file paths for import resolution
      const allFiles = await repoParseGraphService.listFiles(importRecord.id);
      const filePathSet = new Set(allFiles.map((f) => f.path));

      // Re-use tsconfig resolver configs from the retained workspace
      const workspacePath = importRecord.sourceWorkspacePath ?? "";
      const resolverConfigs = workspacePath
        ? await loadTypeScriptResolverConfigs(workspacePath).catch(() => [])
        : [];

      const fileCandidate: WorkspaceFileCandidate = {
        path: normalizedPath,
        absolutePath: workspacePath
          ? path.join(workspacePath, normalizedPath)
          : normalizedPath,
        dirPath:
          path.posix.dirname(normalizedPath) === "."
            ? ""
            : path.posix.dirname(normalizedPath),
        baseName: path.basename(normalizedPath),
        extension: ext,
        language,
        mimeType: inferMimeType(ext),
        sizeBytes: Buffer.byteLength(content, "utf8"),
        contentSha256: buildFileSha256(content),
        isText: true,
        isBinary: false,
        isGenerated: false,
        isIgnored: false,
        ignoreReason: null,
        isParseable: true,
        parseStatus: "parsed",
        parserName: "codemap-regex-parser",
        parserVersion: "0.1.0",
        lineCount: content.split(/\r?\n/).length,
        content,
      };

      const semantics = parseWorkspaceFileSemantics({
        file: fileCandidate,
        filePathSet,
        projectImportId: importRecord.id,
        workspacePath,
        resolverConfigs,
      });

      const fileRowByPath = new Map(allFiles.map((f) => [f.path, f]));

      const symbolDrafts = semantics.symbols.map((sym) => ({
        projectImportId: importRecord.id,
        fileId: fileRecord.id,
        stableSymbolKey: sym.stableKey,
        localSymbolKey: sym.localKey,
        displayName: sym.displayName,
        kind: sym.kind,
        language: sym.language,
        visibility: "unknown" as const,
        isExported: sym.isExported,
        isDefaultExport: sym.isDefaultExport,
        signature: sym.signature,
        returnType: null,
        parentSymbolId: null,
        ownerSymbolKey: null,
        docJson: null,
        typeJson: null,
        modifiersJson: null,
        extraJson: { line: sym.line, col: sym.col } as unknown,
      }));

      const importEdgeDrafts = semantics.imports.map((imp) => {
        const targetFile = imp.targetPathText
          ? fileRowByPath.get(imp.targetPathText)
          : null;

        return {
          localKey: imp.localKey,
          projectImportId: importRecord.id,
          sourceFileId: fileRecord.id,
          targetFileId: targetFile?.id ?? null,
          targetPathText: imp.targetPathText,
          targetExternalSymbolKey: imp.targetExternalSymbolKey,
          moduleSpecifier: imp.moduleSpecifier,
          importKind: imp.importKind,
          isTypeOnly: imp.isTypeOnly,
          isResolved: Boolean(targetFile || imp.targetExternalSymbolKey),
          resolutionKind: imp.resolutionKind,
          startLine: imp.line,
          startCol: imp.col,
          endLine: imp.line,
          endCol: imp.endCol,
          extraJson: null,
        };
      });

      const exportDrafts = semantics.exports.map((exp) => ({
        projectImportId: importRecord.id,
        fileId: fileRecord.id,
        symbolId: null,
        exportName: exp.exportName,
        exportKind: exp.exportKind,
        sourceImportEdgeId: null,
        targetExternalSymbolKey: exp.targetExternalSymbolKey ?? null,
        startLine: exp.line,
        startCol: exp.col,
        endLine: exp.line,
        endCol: exp.endCol,
        extraJson: null,
        symbolLocalKey: exp.symbolLocalKey,
        sourceImportLocalKey: exp.sourceImportLocalKey,
      }));

      const issueDrafts = semantics.issues.map((issue) => ({
        ...issue,
        fileId: fileRecord.id,
      }));

      const updatedFile = await repoParseGraphService.clearAndResyncFileData(
        importRecord.id,
        fileRecord,
        {
          contentSha256: fileCandidate.contentSha256,
          lineCount: fileCandidate.lineCount,
          symbols: symbolDrafts,
          importEdges: importEdgeDrafts,
          exports: exportDrafts,
          issues: issueDrafts,
          externalSymbols: semantics.externalSymbols.map((s) => ({
            ...s,
            projectImportId: importRecord.id,
          })),
        },
      );

      return reply.success({
        synced: true,
        reason: "updated",
        updatedAt: updatedFile.updatedAt.toISOString(),
        stats: {
          symbols: symbolDrafts.length,
          imports: importEdgeDrafts.length,
          exports: exportDrafts.length,
        },
      });
    },
  };
}
