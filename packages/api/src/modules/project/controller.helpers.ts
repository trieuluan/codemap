import type { FastifyInstance, FastifyRequest } from "fastify";
import type { createProjectService } from "./service";
import { normalizeRepositoryFilePath } from "./map/file-preview";
import { findProjectTreeNodeByPath, type ProjectTreeNode } from "./map/tree-builder";

// ─── Auth helpers ────────────────────────────────────────────────────────────

export function getAuthenticatedUserId(
  fastify: FastifyInstance,
  request: FastifyRequest,
): string {
  const userId = request.session?.user?.id;
  if (!userId) {
    throw fastify.httpErrors.unauthorized("Unauthorized");
  }
  return userId;
}

export function throwWorkspaceHttpError(
  fastify: FastifyInstance,
  error: unknown,
): never {
  if (error instanceof Error) {
    if (error.message === "WORKSPACE_ACCESS_DENIED") {
      throw fastify.httpErrors.forbidden("Workspace access denied");
    }
    if (error.message === "WORKSPACE_WRITE_ACCESS_REQUIRED") {
      throw fastify.httpErrors.forbidden(
        "Workspace owner or admin role required",
      );
    }
    if (error.message === "WORKSPACE_PROJECT_LIMIT_EXCEEDED") {
      throw fastify.httpErrors.forbidden("Workspace project limit exceeded");
    }
    if (error.message === "WORKSPACE_IMPORT_LIMIT_EXCEEDED") {
      throw fastify.httpErrors.forbidden("Workspace import limit exceeded");
    }
    if (error.message === "WORKSPACE_CLOUD_IMPORT_NOT_AVAILABLE") {
      throw fastify.httpErrors.forbidden(
        "Cloud import is not available on the basic plan",
      );
    }
    if (error.message === "LOCAL_WORKSPACE_REIMPORT_VIA_MCP_ONLY") {
      throw fastify.httpErrors.badRequest(
        "Local workspace projects can only be reimported via the MCP tool",
      );
    }
    if (error.message === "WORKSPACE_PRIVATE_REPO_IMPORT_DISABLED") {
      throw fastify.httpErrors.forbidden(
        "Private repository imports require a paid plan",
      );
    }
  }
  throw error;
}

// ─── File path resolution ────────────────────────────────────────────────────

export function parseNormalizedFilePath(
  fastify: FastifyInstance,
  rawPath: string,
): string {
  try {
    return normalizeRepositoryFilePath(rawPath);
  } catch (error) {
    throw fastify.httpErrors.badRequest(
      error instanceof Error ? error.message : "Invalid file path",
    );
  }
}

// ─── Project map resolution ──────────────────────────────────────────────────

type ProjectService = ReturnType<typeof createProjectService>;

export interface ResolvedProjectMap {
  project: NonNullable<
    Awaited<ReturnType<ProjectService["getLatestProjectMapWithSource"]>>
  >["project"];
  mapSnapshot: {
    id: string;
    treeJson: unknown;
  };
  importRecord: NonNullable<
    Awaited<ReturnType<ProjectService["getLatestProjectMapWithSource"]>>
  >["importRecord"];
}

export async function resolveProjectMapOrFail(
  fastify: FastifyInstance,
  service: ProjectService,
  projectId: string,
  userId: string,
): Promise<ResolvedProjectMap> {
  const result = await service.getLatestProjectMapWithSource(projectId, userId);
  if (!result) {
    throw fastify.httpErrors.notFound("Project map not found");
  }
  return {
    project: result.project,
    mapSnapshot: result.mapSnapshot,
    importRecord: result.importRecord,
  };
}

export async function resolveProjectMapWithImportOrFail(
  fastify: FastifyInstance,
  service: ProjectService,
  projectId: string,
  userId: string,
): Promise<{
  project: ResolvedProjectMap["project"];
  mapSnapshot: ResolvedProjectMap["mapSnapshot"];
  importRecord: NonNullable<ResolvedProjectMap["importRecord"]>;
}> {
  const resolved = await resolveProjectMapOrFail(
    fastify,
    service,
    projectId,
    userId,
  );
  if (!resolved.importRecord) {
    throw fastify.httpErrors.notFound("Project import not found");
  }
  return {
    project: resolved.project,
    mapSnapshot: resolved.mapSnapshot,
    importRecord: resolved.importRecord,
  };
}

export interface ResolvedFileTreeNode {
  treeNode: ProjectTreeNode;
  normalizedPath: string;
  importRecord: NonNullable<ResolvedProjectMap["importRecord"]>;
}

export async function resolveFileTreeNodeOrFail(
  fastify: FastifyInstance,
  service: ProjectService,
  projectId: string,
  userId: string,
  filePath: string,
): Promise<ResolvedFileTreeNode> {
  const normalizedPath = parseNormalizedFilePath(fastify, filePath);
  const { mapSnapshot, importRecord } = await resolveProjectMapWithImportOrFail(
    fastify,
    service,
    projectId,
    userId,
  );
  const treeNode = findProjectTreeNodeByPath(
    mapSnapshot.treeJson as ProjectTreeNode,
    normalizedPath,
  );
  if (!treeNode) {
    throw fastify.httpErrors.notFound(
      "This file is not present in the latest project map snapshot.",
    );
  }
  return { treeNode, normalizedPath, importRecord };
}

// ─── Column offset helpers ───────────────────────────────────────────────────

/** Convert 0-based column to 1-based, preserving null. */
export function toOneBasedCol(col: number | null | undefined): number | null {
  if (col == null) return null;
  return col + 1;
}

// ─── Parse data response mappers ─────────────────────────────────────────────

export function mapParseDataImports(imports: Array<{
  id: string;
  moduleSpecifier: string;
  importKind: string;
  isResolved: boolean;
  resolutionKind: string | null;
  targetPathText: string | null;
  targetFilePath: string | null;
  targetExternalSymbolKey: string | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}>) {
  return imports.map((item) => ({
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
  }));
}

export function mapParseDataImportedBy(importedBy: Array<{
  id: string;
  sourceFileId: string;
  sourceFilePath: string;
  moduleSpecifier: string;
  importKind: string;
  importedNames: string[];
  resolutionKind: string | null;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}>) {
  return importedBy.map((item) => ({
    id: item.id,
    sourceFileId: item.sourceFileId,
    sourceFilePath: item.sourceFilePath,
    moduleSpecifier: item.moduleSpecifier,
    importKind: item.importKind,
    importedNames: item.importedNames,
    resolutionKind: item.resolutionKind,
    startLine: item.startLine,
    startCol: item.startCol + 1,
    endLine: item.endLine,
    endCol: item.endCol + 1,
  }));
}

interface SymbolRecord {
  id: string;
  startLine: number | null;
  startCol: number | null;
  endLine: number | null;
  endCol: number | null;
}

export function mapParseDataExports(
  exports: Array<{
    symbolId: string | null;
    id: string;
    exportName: string;
    exportKind: string;
    symbolDisplayName: string | null;
    sourceModuleSpecifier: string | null;
    startLine: number | null;
    startCol: number | null;
    endLine: number | null;
    endCol: number | null;
  }>,
  symbolById: Map<string, SymbolRecord>,
) {
  return exports.map((item) => {
    const sym = item.symbolId ? symbolById.get(item.symbolId) : undefined;
    return {
      symbolId: item.symbolId,
      id: item.id,
      exportName: item.exportName,
      exportKind: item.exportKind,
      symbolDisplayName: item.symbolDisplayName,
      sourceModuleSpecifier: item.sourceModuleSpecifier,
      symbolStartLine: sym?.startLine ?? null,
      symbolStartCol: toOneBasedCol(sym?.startCol),
      symbolEndLine: sym?.endLine ?? null,
      symbolEndCol: toOneBasedCol(sym?.endCol),
      startLine: item.startLine,
      startCol: toOneBasedCol(item.startCol),
      endLine: item.endLine,
      endCol: toOneBasedCol(item.endCol),
    };
  });
}

export function mapParseDataSymbols<T extends { startCol: number | null; endCol: number | null }>(
  symbols: T[],
): (Omit<T, "startCol" | "endCol"> & { startCol: number | null; endCol: number | null })[] {
  return symbols.map((item) => ({
    ...item,
    startCol: toOneBasedCol(item.startCol),
    endCol: toOneBasedCol(item.endCol),
  }));
}
