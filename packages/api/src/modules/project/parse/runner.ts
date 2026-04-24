import { createHash } from "node:crypto";
import { lstat, open, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Job } from "bullmq";
import { db } from "../../../db";
import type {
  RepoExportInsert,
  RepoExternalSymbolInsert,
  RepoFileInsert,
  RepoImportEdgeInsert,
  RepoParseIssueInsert,
  RepoSymbolInsert,
  RepoSymbolOccurrenceInsert,
} from "../../../db/schema";
import { normalizeRepositoryFilePath } from "../map/file-preview";
import { createProjectService } from "../service";
import { createRepoParseGraphService } from "./repo-parse-graph";
import ts from "typescript";

const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  ".cache",
]);

const SOURCE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  dart: "Dart",
  php: "PHP",
};

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ts: "text/plain",
  tsx: "text/plain",
  js: "text/javascript",
  jsx: "text/javascript",
  dart: "text/plain",
  php: "text/x-php",
};

const JS_TS_EXTENSIONS = ["ts", "tsx", "js", "jsx"];
const DART_EXTENSIONS = ["dart"];
const PHP_EXTENSIONS = ["php"];
const MAX_PARSE_BYTES = 2 * 1024 * 1024;
const BINARY_SAMPLE_BYTES = 8192;
const PARSE_TOOL_NAME = "codemap-regex-parser";
const PARSE_TOOL_VERSION = "0.1.0";

interface RunProjectParseContext {
  job?: Job;
}

interface TypeScriptPathAliasPattern {
  pattern: string;
  hasWildcard: boolean;
  prefix: string;
  suffix: string;
  targets: string[];
}

interface TypeScriptResolverConfig {
  configPath: string;
  configDirPath: string;
  configDirRelativePath: string;
  baseUrlPath: string;
  pathAliases: TypeScriptPathAliasPattern[];
}

interface TypeScriptCompilerOptionsConfig {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

export interface WorkspaceFileCandidate {
  path: string;
  absolutePath: string;
  dirPath: string;
  baseName: string;
  extension: string | null;
  language: string | null;
  mimeType: string | null;
  sizeBytes: number;
  contentSha256: string | null;
  isText: boolean;
  isBinary: boolean;
  isGenerated: boolean;
  isIgnored: boolean;
  ignoreReason: string | null;
  isParseable: boolean;
  parseStatus: RepoFileInsert["parseStatus"];
  parserName: string | null;
  parserVersion: string | null;
  lineCount: number | null;
  content: string | null;
}

interface ParsedSymbolDraft {
  localKey: string;   // filePath#kind:displayName — name-based, for export/occurrence linking
  stableKey: string;  // filePath#kind:displayName:line — unique per location, for DB constraint
  displayName: string;
  kind: RepoSymbolInsert["kind"];
  language: string;
  signature: string | null;
  isExported: boolean;
  isDefaultExport: boolean;
  line: number;
  col: number;
  endCol: number;
}

interface ParsedImportDraft {
  localKey: string;
  moduleSpecifier: string;
  importKind: RepoImportEdgeInsert["importKind"];
  isTypeOnly: boolean;
  line: number;
  col: number;
  endCol: number;
  resolutionKind: RepoImportEdgeInsert["resolutionKind"];
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
}

interface ParsedExportDraft {
  exportName: string;
  exportKind: RepoExportInsert["exportKind"];
  line: number;
  col: number;
  endCol: number;
  symbolLocalKey?: string;
  sourceImportLocalKey?: string;
  targetExternalSymbolKey?: string | null;
}

interface ParsedWorkspaceSemantics {
  symbols: ParsedSymbolDraft[];
  imports: ParsedImportDraft[];
  exports: ParsedExportDraft[];
  issues: RepoParseIssueInsert[];
  externalSymbols: RepoExternalSymbolInsert[];
}

const projectService = createProjectService(db);
const repoParseGraphService = createRepoParseGraphService(db);

function toParseFailureMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 500);
  }

  return "Project parse failed";
}

async function reportProjectParseProgress(
  context: RunProjectParseContext | undefined,
  progress: number,
  stage: string,
) {
  if (!context?.job) {
    return;
  }

  await context.job.updateProgress({
    progress,
    stage,
  });
}

function buildStableSymbolKey(
  filePath: string,
  kind: string,
  displayName: string,
  line: number,
) {
  return `${filePath}#${kind}:${displayName}:${line}`;
}

export function normalizeExtension(fileName: string) {
  const extension = path.extname(fileName).slice(1).trim().toLowerCase();
  return extension || null;
}

export function inferLanguage(extension: string | null) {
  if (!extension) {
    return null;
  }

  return SOURCE_LANGUAGE_BY_EXTENSION[extension] ?? null;
}

export function inferMimeType(extension: string | null) {
  if (!extension) {
    return null;
  }

  return MIME_TYPE_BY_EXTENSION[extension] ?? null;
}

function isBinaryBuffer(buffer: Buffer) {
  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }
  }

  return false;
}

async function readSampleBuffer(filePath: string, sizeBytes: number) {
  const handle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(Math.min(sizeBytes, BINARY_SAMPLE_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function buildFileSha256(content: Buffer | string) {
  return createHash("sha256").update(content).digest("hex");
}

async function collectWorkspaceFiles(
  workspacePath: string,
): Promise<WorkspaceFileCandidate[]> {
  const candidates: WorkspaceFileCandidate[] = [];

  async function visit(absolutePath: string) {
    const entryStats = await lstat(absolutePath);

    if (entryStats.isSymbolicLink()) {
      return;
    }

    const name = path.basename(absolutePath);

    if (entryStats.isDirectory()) {
      if (IGNORED_NAMES.has(name)) {
        return;
      }

      const entries = await readdir(absolutePath, { withFileTypes: true });

      for (const entry of entries) {
        await visit(path.join(absolutePath, entry.name));
      }

      return;
    }

    if (!entryStats.isFile()) {
      return;
    }

    const relativePath = normalizeRepositoryFilePath(
      path.relative(workspacePath, absolutePath).split(path.sep).join("/"),
    );
    const extension = normalizeExtension(name);
    const language = inferLanguage(extension);
    const mimeType = inferMimeType(extension);
    const sample = await readSampleBuffer(absolutePath, entryStats.size);
    const isBinary = isBinaryBuffer(sample);
    const isText = !isBinary;
    const isParseable =
      Boolean(language) && isText && entryStats.size <= MAX_PARSE_BYTES;

    if (!isParseable) {
      candidates.push({
        path: relativePath,
        absolutePath,
        dirPath:
          path.posix.dirname(relativePath) === "."
            ? ""
            : path.posix.dirname(relativePath),
        baseName: name,
        extension,
        language,
        mimeType,
        sizeBytes: entryStats.size,
        contentSha256: null,
        isText,
        isBinary,
        isGenerated: false,
        isIgnored: false,
        ignoreReason: null,
        isParseable: false,
        parseStatus: isBinary
          ? "binary"
          : entryStats.size > MAX_PARSE_BYTES
            ? "too_large"
            : "unsupported",
        parserName: null,
        parserVersion: null,
        lineCount: null,
        content: null,
      });
      return;
    }

    const content = await readFile(absolutePath, "utf8");

    candidates.push({
      path: relativePath,
      absolutePath,
      dirPath:
        path.posix.dirname(relativePath) === "."
          ? ""
          : path.posix.dirname(relativePath),
      baseName: name,
      extension,
      language,
      mimeType,
      sizeBytes: entryStats.size,
      contentSha256: buildFileSha256(content),
      isText: true,
      isBinary: false,
      isGenerated: false,
      isIgnored: false,
      ignoreReason: null,
      isParseable: true,
      parseStatus: "parsed",
      parserName: PARSE_TOOL_NAME,
      parserVersion: PARSE_TOOL_VERSION,
      lineCount: content.split(/\r?\n/).length,
      content,
    });
  }

  await visit(workspacePath);
  return candidates.sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeWorkspaceRelativePath(
  workspacePath: string,
  targetPath: string,
) {
  const relativePath = path.relative(workspacePath, targetPath);

  if (!relativePath) {
    return "";
  }

  return normalizeRepositoryFilePath(relativePath.split(path.sep).join("/"));
}

function readTsConfigFile(configPath: string) {
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    return null;
  }
  return readResult.config as {
    extends?: string;
    compilerOptions?: TypeScriptCompilerOptionsConfig;
  };
}

async function readTypeScriptCompilerOptionsConfig(
  configPath: string,
  visited = new Set<string>(),
): Promise<TypeScriptCompilerOptionsConfig | null> {
  if (visited.has(configPath)) {
    return null;
  }

  visited.add(configPath);

  try {
    const parsed = readTsConfigFile(configPath);

    const configDirPath = path.dirname(configPath);
    let inheritedConfig: TypeScriptCompilerOptionsConfig | null = null;

    if (parsed?.extends && parsed?.extends.startsWith(".")) {
      const extendsPath = parsed.extends.endsWith(".json")
        ? parsed.extends
        : `${parsed.extends}.json`;
      inheritedConfig = await readTypeScriptCompilerOptionsConfig(
        path.resolve(configDirPath, extendsPath),
        visited,
      );
    }

    return {
      baseUrl: parsed?.compilerOptions?.baseUrl ?? inheritedConfig?.baseUrl,
      paths: parsed?.compilerOptions?.paths ?? inheritedConfig?.paths,
    };
  } catch (error) {
    console.log(error);
    return null;
  }
}

export async function loadTypeScriptResolverConfigs(
  workspacePath: string,
): Promise<TypeScriptResolverConfig[]> {
  const configRelativePaths = ["tsconfig.json", "jsconfig.json"];
  const discoveredConfigs = new Set<string>();

  async function visit(absolutePath: string) {
    const entryStats = await lstat(absolutePath);

    if (entryStats.isSymbolicLink()) {
      return;
    }

    const name = path.basename(absolutePath);

    if (entryStats.isDirectory()) {
      if (IGNORED_NAMES.has(name)) {
        return;
      }

      const entries = await readdir(absolutePath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await visit(path.join(absolutePath, entry.name));
          continue;
        }

        if (
          entry.isFile() &&
          (entry.name === "tsconfig.json" || entry.name === "jsconfig.json")
        ) {
          discoveredConfigs.add(path.join(absolutePath, entry.name));
        }
      }

      return;
    }
  }

  for (const relativePath of configRelativePaths) {
    discoveredConfigs.add(path.join(workspacePath, relativePath));
  }

  await visit(workspacePath);

  const resolverConfigs: TypeScriptResolverConfig[] = [];

  for (const configPath of discoveredConfigs) {
    try {
      const compilerOptions =
        await readTypeScriptCompilerOptionsConfig(configPath);

      if (!compilerOptions?.paths) {
        continue;
      }

      const configDirPath = path.dirname(configPath);
      const baseUrlPath = path.resolve(
        configDirPath,
        compilerOptions.baseUrl ?? ".",
      );
      const pathAliases = Object.entries(compilerOptions.paths ?? {})
        .filter(([, targets]) => Array.isArray(targets) && targets.length > 0)
        .map(([pattern, targets]) => {
          const wildcardIndex = pattern.indexOf("*");

          return {
            pattern,
            hasWildcard: wildcardIndex >= 0,
            prefix:
              wildcardIndex >= 0 ? pattern.slice(0, wildcardIndex) : pattern,
            suffix: wildcardIndex >= 0 ? pattern.slice(wildcardIndex + 1) : "",
            targets,
          };
        });

      if (pathAliases.length === 0) {
        continue;
      }

      resolverConfigs.push({
        configPath,
        configDirPath,
        configDirRelativePath: normalizeWorkspaceRelativePath(
          workspacePath,
          configDirPath,
        ),
        baseUrlPath,
        pathAliases,
      });
    } catch (error) {
      console.log(
        `Failed to read TypeScript resolver config at ${configPath}`,
        error,
      );
      continue;
    }
  }

  return resolverConfigs.sort(
    (left, right) => right.configDirPath.length - left.configDirPath.length,
  );
}

function buildLocalSymbolKey(
  filePath: string,
  kind: string,
  displayName: string,
) {
  return `${filePath}#${kind}:${displayName}`;
}

function buildImportLocalKey(
  filePath: string,
  importKind: string,
  moduleSpecifier: string,
  line: number,
  col: number,
) {
  return `${filePath}#${importKind}:${moduleSpecifier}:${line}:${col}`;
}

function resolveRelativeTargetPath(
  sourceFilePath: string,
  moduleSpecifier: string,
  language: string,
  filePathSet: Set<string>,
) {
  const basePath = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourceFilePath), moduleSpecifier),
  );
  const extensions =
    language === "Dart"
      ? DART_EXTENSIONS
      : language === "PHP"
        ? PHP_EXTENSIONS
        : JS_TS_EXTENSIONS;
  const candidates = [basePath];

  if (!path.posix.extname(basePath)) {
    for (const extension of extensions) {
      candidates.push(`${basePath}.${extension}`);
      candidates.push(`${basePath}/index.${extension}`);
    }
  } else if (path.posix.extname(basePath) === ".js") {
    const stem = basePath.slice(0, -3);
    candidates.push(`${stem}.ts`, `${stem}.tsx`);
  }

  const resolvedPath = candidates.find((candidate) =>
    filePathSet.has(candidate),
  );

  return {
    resolvedPath: resolvedPath ?? null,
    attemptedPath: basePath,
  };
}

function findBestResolverConfig(
  sourceFilePath: string,
  resolverConfigs: TypeScriptResolverConfig[],
) {
  return (
    resolverConfigs.find((config) => {
      const configRelativeDir = config.configDirRelativePath;

      if (!configRelativeDir) {
        return true;
      }

      return (
        path.posix
          .dirname(sourceFilePath)
          .startsWith(`${configRelativeDir}/`) ||
        path.posix.dirname(sourceFilePath) === configRelativeDir
      );
    }) ?? null
  );
}

function resolveTsconfigAliasTargetPath(
  workspacePath: string,
  sourceFilePath: string,
  moduleSpecifier: string,
  language: string,
  filePathSet: Set<string>,
  resolverConfigs: TypeScriptResolverConfig[],
) {
  const resolverConfig = findBestResolverConfig(
    sourceFilePath,
    resolverConfigs,
  );

  if (!resolverConfig) {
    return null;
  }

  const extensions =
    language === "TypeScript" || language === "JavaScript"
      ? JS_TS_EXTENSIONS
      : language === "Dart"
        ? DART_EXTENSIONS
        : PHP_EXTENSIONS;

  for (const alias of resolverConfig.pathAliases) {
    let wildcardValue = "";

    if (alias.hasWildcard) {
      if (
        !moduleSpecifier.startsWith(alias.prefix) ||
        !moduleSpecifier.endsWith(alias.suffix)
      ) {
        continue;
      }

      wildcardValue = moduleSpecifier.slice(
        alias.prefix.length,
        moduleSpecifier.length - alias.suffix.length,
      );
    } else if (moduleSpecifier !== alias.pattern) {
      continue;
    }

    for (const targetPattern of alias.targets) {
      const targetValue = alias.hasWildcard
        ? targetPattern.replace(/\*/g, wildcardValue)
        : targetPattern;
      const candidateBasePath = path.resolve(
        resolverConfig.baseUrlPath,
        targetValue,
      );
      const candidateRelativeBasePath = normalizeWorkspaceRelativePath(
        workspacePath,
        candidateBasePath,
      );
      const candidates = [candidateRelativeBasePath];

      if (!path.posix.extname(candidateRelativeBasePath)) {
        for (const extension of extensions) {
          candidates.push(`${candidateRelativeBasePath}.${extension}`);
          candidates.push(`${candidateRelativeBasePath}/index.${extension}`);
        }
      }

      const resolvedPath = candidates.find((candidate) =>
        filePathSet.has(candidate),
      );

      if (resolvedPath) {
        return {
          matched: true,
          resolvedPath,
          attemptedPath: candidateRelativeBasePath,
        };
      }

      return {
        matched: true,
        resolvedPath: null,
        attemptedPath: candidateRelativeBasePath,
      };
    }
  }

  return null;
}

function createExternalSymbolDraft(
  projectImportId: string,
  language: string,
  moduleSpecifier: string,
): RepoExternalSymbolInsert {
  return {
    projectImportId,
    symbolKey: `${language.toLowerCase()}:${moduleSpecifier}`,
    packageManager:
      language === "Dart" ? "pub" : language === "PHP" ? "composer" : "npm",
    packageName: moduleSpecifier,
    packageVersion: null,
    language,
    displayName: moduleSpecifier,
    kind: language === "PHP" ? "namespace" : "module",
    documentationJson: null,
    extraJson: null,
  };
}

function maskCommentsAndTemplateLiterals(
  content: string,
  options: { hashLineComments?: boolean } = {},
) {
  const chars = content.split("");
  let index = 0;
  let state:
    | "code"
    | "single"
    | "double"
    | "template"
    | "line-comment"
    | "block-comment" = "code";

  function maskChar(position: number) {
    if (chars[position] !== "\n" && chars[position] !== "\r") {
      chars[position] = " ";
    }
  }

  while (index < chars.length) {
    const char = chars[index];
    const nextChar = chars[index + 1];

    if (state === "line-comment") {
      if (char === "\n" || char === "\r") {
        state = "code";
      } else {
        maskChar(index);
      }

      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && nextChar === "/") {
        maskChar(index);
        maskChar(index + 1);
        index += 2;
        state = "code";
        continue;
      }

      maskChar(index);
      index += 1;
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      if (state === "template") {
        maskChar(index);
      }

      if (char === "\\") {
        if (state === "template") {
          maskChar(index + 1);
        }
        index += 2;
        continue;
      }

      if (
        (state === "single" && char === "'") ||
        (state === "double" && char === '"') ||
        (state === "template" && char === "`")
      ) {
        state = "code";
      }

      index += 1;
      continue;
    }

    if (char === "/" && nextChar === "/") {
      maskChar(index);
      maskChar(index + 1);
      index += 2;
      state = "line-comment";
      continue;
    }

    if (options.hashLineComments && char === "#") {
      maskChar(index);
      index += 1;
      state = "line-comment";
      continue;
    }

    if (char === "/" && nextChar === "*") {
      maskChar(index);
      maskChar(index + 1);
      index += 2;
      state = "block-comment";
      continue;
    }

    if (char === "'") {
      state = "single";
    } else if (char === '"') {
      state = "double";
    } else if (char === "`") {
      maskChar(index);
      state = "template";
    }

    index += 1;
  }

  return chars.join("");
}

function parseTypeScriptOrJavaScriptFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
  workspacePath: string,
  resolverConfigs: TypeScriptResolverConfig[],
): ParsedWorkspaceSemantics {
  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    issues: [],
    externalSymbols: [],
  };
  const originalLines = (file.content ?? "").split(/\r?\n/);
  const lines = maskCommentsAndTemplateLiterals(file.content ?? "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const originalLine = originalLines[index] ?? line;
    const lineNumber = index + 1;

    const pushImport = (
      moduleSpecifier: string,
      importKind: ParsedImportDraft["importKind"],
      isTypeOnly: boolean,
      matchIndex: number,
    ) => {
      const isRelative = moduleSpecifier.startsWith(".");
      const aliasResolution = !isRelative
        ? resolveTsconfigAliasTargetPath(
            workspacePath,
            file.path,
            moduleSpecifier,
            file.language!,
            filePathSet,
            resolverConfigs,
          )
        : null;
      const resolution = isRelative
        ? resolveRelativeTargetPath(
            file.path,
            moduleSpecifier,
            file.language!,
            filePathSet,
          )
        : (aliasResolution ?? {
            resolvedPath: null,
            attemptedPath: null,
          });
      const importLocalKey = buildImportLocalKey(
        file.path,
        importKind,
        moduleSpecifier,
        lineNumber,
        matchIndex,
      );

      semantics.imports.push({
        localKey: importLocalKey,
        moduleSpecifier,
        importKind,
        isTypeOnly,
        line: lineNumber,
        col: matchIndex,
        endCol: matchIndex + moduleSpecifier.length,
        resolutionKind: isRelative
          ? resolution.resolvedPath
            ? "relative_path"
            : "unresolved"
          : aliasResolution?.resolvedPath
            ? "tsconfig_alias"
            : aliasResolution?.matched
              ? "unresolved"
              : "package",
        targetPathText: resolution.resolvedPath ?? resolution.attemptedPath,
        targetExternalSymbolKey:
          isRelative || aliasResolution?.matched
            ? null
            : `${file.language?.toLowerCase()}:${moduleSpecifier}`,
      });

      if (!isRelative && !aliasResolution?.matched) {
        semantics.externalSymbols.push(
          createExternalSymbolDraft(
            projectImportId,
            file.language!,
            moduleSpecifier,
          ),
        );
      } else if (!resolution.resolvedPath) {
        semantics.issues.push({
          projectImportId,
          severity: "warning",
          code: "UNRESOLVED_IMPORT",
          message: `Unable to resolve module "${moduleSpecifier}" from ${file.path}`,
          detailJson: {
            filePath: file.path,
            moduleSpecifier,
          },
        });
      }

      return importLocalKey;
    };

    for (const match of line.matchAll(
      /\bimport\s+(type\s+)?(?:[^'"]+?\s+from\s+)?["']([^"']+)["']/g,
    )) {
      const moduleSpecifier = match[2];

      if (!moduleSpecifier) {
        continue;
      }

      pushImport(
        moduleSpecifier,
        "import",
        Boolean(match[1]),
        match.index ?? 0,
      );
    }

    for (const match of line.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!match[1]) {
        continue;
      }

      pushImport(match[1], "require", false, match.index ?? 0);
    }

    for (const match of line.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!match[1]) {
        continue;
      }

      pushImport(match[1], "dynamic_import", false, match.index ?? 0);
    }

    for (const match of line.matchAll(
      /\bexport\s+(type\s+)?\*\s+from\s+["']([^"']+)["']/g,
    )) {
      if (!match[2]) {
        continue;
      }

      const importLocalKey = pushImport(
        match[2],
        "export_from",
        Boolean(match[1]),
        match.index ?? 0,
      );

      semantics.exports.push({
        exportName: "*",
        exportKind: "wildcard",
        line: lineNumber,
        col: match.index ?? 0,
        endCol: (match.index ?? 0) + match[0].length,
        sourceImportLocalKey: importLocalKey,
        targetExternalSymbolKey: match[2].startsWith(".")
          ? null
          : `${file.language?.toLowerCase()}:${match[2]}`,
      });
    }

    for (const match of line.matchAll(
      /\bexport\s+(type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g,
    )) {
      if (!match[3]) {
        continue;
      }

      const importLocalKey = pushImport(
        match[3],
        "export_from",
        Boolean(match[1]),
        match.index ?? 0,
      );
      const exportedItems = match[2]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      for (const exportedItem of exportedItems) {
        const [, exportName] =
          exportedItem.match(/^(?:.+\s+as\s+)?([A-Za-z_$][\w$]*)$/) ?? [];

        semantics.exports.push({
          exportName: exportName ?? exportedItem,
          exportKind: "re_export",
          line: lineNumber,
          col: match.index ?? 0,
          endCol: (match.index ?? 0) + match[0].length,
          sourceImportLocalKey: importLocalKey,
          targetExternalSymbolKey: match[3].startsWith(".")
            ? null
            : `${file.language?.toLowerCase()}:${match[3]}`,
        });
      }
    }

    const symbolPatterns: Array<{
      regex: RegExp;
      kind: ParsedSymbolDraft["kind"];
      defaultExport?: boolean;
      exportPrefix?: boolean;
    }> = [
      {
        regex: /^\s*export\s+default\s+class\s+([A-Za-z_$][\w$]*)/,
        kind: "class",
        defaultExport: true,
        exportPrefix: true,
      },
      {
        regex: /^\s*export\s+default\s+function\s+([A-Za-z_$][\w$]*)/,
        kind: "function",
        defaultExport: true,
        exportPrefix: true,
      },
      {
        regex: /^\s*export\s+class\s+([A-Za-z_$][\w$]*)/,
        kind: "class",
        exportPrefix: true,
      },
      {
        regex: /^\s*class\s+([A-Za-z_$][\w$]*)/,
        kind: "class",
      },
      {
        regex: /^\s*export\s+interface\s+([A-Za-z_$][\w$]*)/,
        kind: "interface",
        exportPrefix: true,
      },
      {
        regex: /^\s*interface\s+([A-Za-z_$][\w$]*)/,
        kind: "interface",
      },
      {
        regex: /^\s*export\s+function\s+([A-Za-z_$][\w$]*)/,
        kind: "function",
        exportPrefix: true,
      },
      {
        regex: /^\s*function\s+([A-Za-z_$][\w$]*)/,
        kind: "function",
      },
      {
        regex: /^\s*export\s+enum\s+([A-Za-z_$][\w$]*)/,
        kind: "enum",
        exportPrefix: true,
      },
      {
        regex: /^\s*enum\s+([A-Za-z_$][\w$]*)/,
        kind: "enum",
      },
      {
        regex: /^\s*export\s+type\s+([A-Za-z_$][\w$]*)/,
        kind: "type_alias",
        exportPrefix: true,
      },
    ];

    for (const pattern of symbolPatterns) {
      const match = line.match(pattern.regex);

      if (!match?.[1]) {
        continue;
      }

      const displayName = match[1];
      const localKey = buildLocalSymbolKey(
        file.path,
        pattern.kind,
        displayName,
      );
      const col = line.indexOf(displayName);

      semantics.symbols.push({
        localKey,
        stableKey: buildStableSymbolKey(file.path, pattern.kind, displayName, lineNumber),
        displayName,
        kind: pattern.kind,
        language: file.language!,
        signature: originalLine.trim(),
        isExported: Boolean(pattern.exportPrefix),
        isDefaultExport: Boolean(pattern.defaultExport),
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + displayName.length,
      });

      if (pattern.exportPrefix) {
        semantics.exports.push({
          exportName: pattern.defaultExport ? "default" : displayName,
          exportKind: pattern.defaultExport ? "default" : "named",
          line: lineNumber,
          col: Math.max(col, 0),
          endCol: Math.max(col, 0) + displayName.length,
          symbolLocalKey: localKey,
        });
      }

      break;
    }

    const namedExportMatch = line.match(/^\s*export\s+\{([^}]+)\}/);

    if (namedExportMatch?.[1]) {
      const exportedItems = namedExportMatch[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      for (const exportedItem of exportedItems) {
        const renameMatch = exportedItem.match(
          /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/,
        );

        if (!renameMatch?.[1]) {
          continue;
        }

        semantics.exports.push({
          exportName: renameMatch[2] ?? renameMatch[1],
          exportKind: "named",
          line: lineNumber,
          col: line.indexOf(exportedItem),
          endCol: line.indexOf(exportedItem) + exportedItem.length,
          symbolLocalKey: buildLocalSymbolKey(
            file.path,
            "variable",
            renameMatch[1],
          ),
        });
      }
    }
  });

  return semantics;
}

function parseDartFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): ParsedWorkspaceSemantics {
  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    issues: [],
    externalSymbols: [],
  };
  const originalLines = (file.content ?? "").split(/\r?\n/);
  const lines = maskCommentsAndTemplateLiterals(file.content ?? "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const originalLine = originalLines[index] ?? line;
    const lineNumber = index + 1;

    for (const match of line.matchAll(
      /^\s*(import|export|part)\s+['"]([^'"]+)['"]/g,
    )) {
      const kind = match[1];
      const moduleSpecifier = match[2];

      if (!kind || !moduleSpecifier) {
        continue;
      }

      const resolution = resolveRelativeTargetPath(
        file.path,
        moduleSpecifier,
        file.language!,
        filePathSet,
      );
      const importKind =
        kind === "part"
          ? "include"
          : kind === "export"
            ? "export_from"
            : "import";
      const localKey = buildImportLocalKey(
        file.path,
        importKind,
        moduleSpecifier,
        lineNumber,
        match.index ?? 0,
      );

      semantics.imports.push({
        localKey,
        moduleSpecifier,
        importKind,
        isTypeOnly: false,
        line: lineNumber,
        col: match.index ?? 0,
        endCol: (match.index ?? 0) + moduleSpecifier.length,
        resolutionKind: resolution.resolvedPath
          ? "relative_path"
          : "unresolved",
        targetPathText: resolution.resolvedPath ?? resolution.attemptedPath,
        targetExternalSymbolKey: null,
      });

      if (!resolution.resolvedPath) {
        semantics.issues.push({
          projectImportId,
          severity: "warning",
          code: "UNRESOLVED_IMPORT",
          message: `Unable to resolve ${kind} "${moduleSpecifier}" from ${file.path}`,
          detailJson: {
            filePath: file.path,
            moduleSpecifier,
            kind,
          },
        });
      }

      if (kind === "export") {
        semantics.exports.push({
          exportName: moduleSpecifier,
          exportKind: "re_export",
          line: lineNumber,
          col: match.index ?? 0,
          endCol: (match.index ?? 0) + match[0].length,
          sourceImportLocalKey: localKey,
        });
      }
    }

    const symbolPatterns: Array<{
      regex: RegExp;
      kind: ParsedSymbolDraft["kind"];
    }> = [
      { regex: /^\s*class\s+([A-Za-z_]\w*)/, kind: "class" },
      { regex: /^\s*mixin\s+([A-Za-z_]\w*)/, kind: "mixin" },
      { regex: /^\s*extension\s+([A-Za-z_]\w*)/, kind: "mixin" },
      { regex: /^\s*enum\s+([A-Za-z_]\w*)/, kind: "enum" },
      { regex: /^\s*typedef\s+([A-Za-z_]\w*)/, kind: "type_alias" },
    ];

    for (const pattern of symbolPatterns) {
      const match = line.match(pattern.regex);

      if (!match?.[1]) {
        continue;
      }

      const displayName = match[1];
      const col = line.indexOf(displayName);

      semantics.symbols.push({
        localKey: buildLocalSymbolKey(file.path, pattern.kind, displayName),
        stableKey: buildStableSymbolKey(file.path, pattern.kind, displayName, lineNumber),
        displayName,
        kind: pattern.kind,
        language: file.language!,
        signature: originalLine.trim(),
        isExported: false,
        isDefaultExport: false,
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + displayName.length,
      });

      break;
    }
  });

  return semantics;
}

function parsePhpFile(
  file: WorkspaceFileCandidate,
  projectImportId: string,
): ParsedWorkspaceSemantics {
  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    issues: [],
    externalSymbols: [],
  };
  const originalLines = (file.content ?? "").split(/\r?\n/);
  const lines = maskCommentsAndTemplateLiterals(file.content ?? "", {
    hashLineComments: true,
  }).split(/\r?\n/);

  lines.forEach((line, index) => {
    const originalLine = originalLines[index] ?? line;
    const lineNumber = index + 1;
    const namespaceMatch = line.match(/^\s*namespace\s+([^;]+);/);

    if (namespaceMatch?.[1]) {
      const namespace = namespaceMatch[1].trim();
      const col = line.indexOf(namespace);

      semantics.symbols.push({
        localKey: buildLocalSymbolKey(file.path, "namespace", namespace),
        stableKey: buildStableSymbolKey(file.path, "namespace", namespace, lineNumber),
        displayName: namespace,
        kind: "namespace",
        language: file.language!,
        signature: originalLine.trim(),
        isExported: false,
        isDefaultExport: false,
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + namespace.length,
      });
    }

    const useMatch = line.match(/^\s*use\s+([^;]+);/);

    if (useMatch?.[1]) {
      const namespace = useMatch[1].trim();
      const col = line.indexOf(namespace);
      const localKey = buildImportLocalKey(
        file.path,
        "use",
        namespace,
        lineNumber,
        col,
      );

      semantics.imports.push({
        localKey,
        moduleSpecifier: namespace,
        importKind: "use",
        isTypeOnly: false,
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + namespace.length,
        resolutionKind: "package",
        targetPathText: null,
        targetExternalSymbolKey: `php:${namespace}`,
      });
      semantics.externalSymbols.push(
        createExternalSymbolDraft(projectImportId, file.language!, namespace),
      );
    }

    const symbolPatterns: Array<{
      regex: RegExp;
      kind: ParsedSymbolDraft["kind"];
    }> = [
      { regex: /^\s*class\s+([A-Za-z_]\w*)/, kind: "class" },
      { regex: /^\s*interface\s+([A-Za-z_]\w*)/, kind: "interface" },
      { regex: /^\s*trait\s+([A-Za-z_]\w*)/, kind: "trait" },
      { regex: /^\s*function\s+([A-Za-z_]\w*)/, kind: "function" },
    ];

    for (const pattern of symbolPatterns) {
      const match = line.match(pattern.regex);

      if (!match?.[1]) {
        continue;
      }

      const displayName = match[1];
      const col = line.indexOf(displayName);

      semantics.symbols.push({
        localKey: buildLocalSymbolKey(file.path, pattern.kind, displayName),
        stableKey: buildStableSymbolKey(file.path, pattern.kind, displayName, lineNumber),
        displayName,
        kind: pattern.kind,
        language: file.language!,
        signature: originalLine.trim(),
        isExported: false,
        isDefaultExport: false,
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + displayName.length,
      });

      break;
    }
  });

  return semantics;
}

export function parseWorkspaceFileSemantics(input: {
  file: WorkspaceFileCandidate;
  filePathSet: Set<string>;
  projectImportId: string;
  workspacePath: string;
  resolverConfigs?: TypeScriptResolverConfig[];
}) {
  if (!input.file.language || !input.file.content) {
    return {
      symbols: [],
      imports: [],
      exports: [],
      issues: [],
      externalSymbols: [],
    } satisfies ParsedWorkspaceSemantics;
  }

  switch (input.file.language) {
    case "TypeScript":
    case "JavaScript":
      return parseTypeScriptOrJavaScriptFile(
        input.file,
        input.filePathSet,
        input.projectImportId,
        input.workspacePath,
        input.resolverConfigs ?? [],
      );
    case "Dart":
      return parseDartFile(
        input.file,
        input.filePathSet,
        input.projectImportId,
      );
    case "PHP":
      return parsePhpFile(input.file, input.projectImportId);
    default:
      return {
        symbols: [],
        imports: [],
        exports: [],
        issues: [],
        externalSymbols: [],
      } satisfies ParsedWorkspaceSemantics;
  }
}

export async function runProjectParse(
  importId: string,
  context?: RunProjectParseContext,
) {
  const importDetails = await projectService.getImportWithProject(importId);

  if (!importDetails) {
    throw new Error(`Project import not found: ${importId}`);
  }

  const { importRecord } = importDetails;

  if (!importRecord.sourceAvailable || !importRecord.sourceWorkspacePath) {
    const errorMessage =
      "Retained repository source is unavailable for parsing";
    await projectService.markParseAsFailed(importId, errorMessage);
    throw new Error(errorMessage);
  }

  try {
    await projectService.markParseAsRunning(importId, {
      parseTool: PARSE_TOOL_NAME,
      parseToolVersion: PARSE_TOOL_VERSION,
    });
    await reportProjectParseProgress(context, 10, "collecting-files");

    await repoParseGraphService.clearImportData(importId);

    const workspaceFiles = await collectWorkspaceFiles(
      importRecord.sourceWorkspacePath,
    );
    const resolverConfigs = await loadTypeScriptResolverConfigs(
      importRecord.sourceWorkspacePath,
    );
    const fileRows = await repoParseGraphService.saveFiles(
      workspaceFiles.map((file) => ({
        projectImportId: importId,
        path: file.path,
        dirPath: file.dirPath,
        baseName: file.baseName,
        extension: file.extension,
        language: file.language,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        contentSha256: file.contentSha256,
        isText: file.isText,
        isBinary: file.isBinary,
        isGenerated: file.isGenerated,
        isIgnored: file.isIgnored,
        ignoreReason: file.ignoreReason,
        isParseable: file.isParseable,
        parseStatus: file.parseStatus,
        parserName: file.parserName,
        parserVersion: file.parserVersion,
        lineCount: file.lineCount,
        extraJson: null,
      })),
    );

    const fileRowByPath = new Map(
      fileRows.map((file) => [file.path, file] as const),
    );
    const filePathSet = new Set(fileRows.map((file) => file.path));
    const symbolDrafts: RepoSymbolInsert[] = [];
    const occurrenceDrafts: RepoSymbolOccurrenceInsert[] = [];
    const importEdgeDrafts: Array<RepoImportEdgeInsert & { localKey: string }> =
      [];
    const exportDrafts: Array<
      RepoExportInsert & {
        symbolLocalKey?: string;
        sourceImportLocalKey?: string;
      }
    > = [];
    const parseIssues: RepoParseIssueInsert[] = [];
    const externalSymbols: RepoExternalSymbolInsert[] = [];

    await reportProjectParseProgress(context, 45, "parsing-files");

    for (const workspaceFile of workspaceFiles) {
      if (
        !workspaceFile.isParseable ||
        !workspaceFile.content ||
        !workspaceFile.language
      ) {
        continue;
      }

      const fileRow = fileRowByPath.get(workspaceFile.path);

      if (!fileRow) {
        continue;
      }

      try {
        const semantics = parseWorkspaceFileSemantics({
          file: workspaceFile,
          filePathSet,
          projectImportId: importId,
          workspacePath: importRecord.sourceWorkspacePath,
          resolverConfigs,
        });

        for (const symbol of semantics.symbols) {
          symbolDrafts.push({
            projectImportId: importId,
            fileId: fileRow.id,
            stableSymbolKey: symbol.stableKey,
            localSymbolKey: symbol.localKey,
            displayName: symbol.displayName,
            kind: symbol.kind,
            language: symbol.language,
            visibility: "unknown",
            isExported: symbol.isExported,
            isDefaultExport: symbol.isDefaultExport,
            signature: symbol.signature,
            returnType: null,
            parentSymbolId: null,
            ownerSymbolKey: null,
            docJson: null,
            typeJson: null,
            modifiersJson: null,
            extraJson: {
              line: symbol.line,
              col: symbol.col,
            },
          });
        }

        for (const issue of semantics.issues) {
          parseIssues.push({
            ...issue,
            fileId: fileRow.id,
          });
        }

        externalSymbols.push(...semantics.externalSymbols);

        for (const importEdge of semantics.imports) {
          const targetFile = importEdge.targetPathText
            ? fileRowByPath.get(importEdge.targetPathText)
            : null;

          importEdgeDrafts.push({
            localKey: importEdge.localKey,
            projectImportId: importId,
            sourceFileId: fileRow.id,
            targetFileId: targetFile?.id ?? null,
            targetPathText: importEdge.targetPathText,
            targetExternalSymbolKey: importEdge.targetExternalSymbolKey,
            moduleSpecifier: importEdge.moduleSpecifier,
            importKind: importEdge.importKind,
            isTypeOnly: importEdge.isTypeOnly,
            isResolved: Boolean(
              targetFile || importEdge.targetExternalSymbolKey,
            ),
            resolutionKind: importEdge.resolutionKind,
            startLine: importEdge.line,
            startCol: importEdge.col,
            endLine: importEdge.line,
            endCol: importEdge.endCol,
            extraJson: null,
          });
        }

        for (const exported of semantics.exports) {
          exportDrafts.push({
            projectImportId: importId,
            fileId: fileRow.id,
            symbolId: null,
            exportName: exported.exportName,
            exportKind: exported.exportKind,
            sourceImportEdgeId: null,
            targetExternalSymbolKey: exported.targetExternalSymbolKey ?? null,
            startLine: exported.line,
            startCol: exported.col,
            endLine: exported.line,
            endCol: exported.endCol,
            extraJson: null,
            symbolLocalKey: exported.symbolLocalKey,
            sourceImportLocalKey: exported.sourceImportLocalKey,
          });
        }
      } catch (error) {
        parseIssues.push({
          projectImportId: importId,
          fileId: fileRow.id,
          severity: "error",
          code: "FILE_PARSE_ERROR",
          message: toParseFailureMessage(error),
          detailJson: {
            filePath: workspaceFile.path,
          },
        });
      }
    }

    const savedSymbols = await repoParseGraphService.saveSymbols(symbolDrafts);
    const symbolIdByLocalKey = new Map(
      savedSymbols
        .map((symbol) => [symbol.localSymbolKey, symbol.id] as const)
        .filter((entry): entry is [string, string] =>
          Boolean(entry[0] && entry[1]),
        ),
    );

    for (const symbol of symbolDrafts) {
      const fileRow = fileRowByPath.get(
        symbol.localSymbolKey?.split("#")[0] ?? "",
      );
      const symbolId = symbol.localSymbolKey
        ? symbolIdByLocalKey.get(symbol.localSymbolKey)
        : null;
      const location =
        (symbol.extraJson as { line: number; col: number } | null) ?? null;

      if (!fileRow || !symbolId || !location) {
        continue;
      }

      occurrenceDrafts.push({
        projectImportId: importId,
        fileId: fileRow.id,
        symbolId,
        occurrenceRole: "definition",
        startLine: location.line,
        startCol: location.col,
        endLine: location.line,
        endCol: location.col + symbol.displayName.length,
        syntaxKind: symbol.kind,
        snippetPreview: symbol.signature,
        extraJson: null,
      });
    }

    await repoParseGraphService.saveOccurrences(occurrenceDrafts);

    const savedImportEdges = await repoParseGraphService.saveImportEdges(
      importEdgeDrafts.map(
        ({ localKey: _localKey, ...importEdge }) => importEdge,
      ),
    );
    const importEdgeIdByLocalKey = new Map<string, string>();

    importEdgeDrafts.forEach((draft, index) => {
      const savedImportEdge = savedImportEdges[index];

      if (savedImportEdge) {
        importEdgeIdByLocalKey.set(draft.localKey, savedImportEdge.id);
      }
    });

    await repoParseGraphService.saveExports(
      exportDrafts.map(
        ({ symbolLocalKey, sourceImportLocalKey, ...exportDraft }) => ({
          ...exportDraft,
          symbolId: symbolLocalKey
            ? (symbolIdByLocalKey.get(symbolLocalKey) ?? null)
            : null,
          sourceImportEdgeId: sourceImportLocalKey
            ? (importEdgeIdByLocalKey.get(sourceImportLocalKey) ?? null)
            : null,
        }),
      ),
    );
    await repoParseGraphService.saveParseIssues(parseIssues);
    await repoParseGraphService.upsertExternalSymbols(externalSymbols);

    const totalFileCount = fileRows.length;
    const sourceFileCount = fileRows.filter((file) =>
      Boolean(file.language),
    ).length;
    const parsedFileCount = fileRows.filter(
      (file) => file.parseStatus === "parsed",
    ).length;
    const dependencyCount = savedImportEdges.length;
    const errorFileCount = parseIssues.filter(
      (issue) => issue.severity === "error",
    ).length;
    const skippedFileCount = fileRows.filter(
      (file) => file.parseStatus !== "parsed",
    ).length;
    const indexedSymbolCount = savedSymbols.length;

    await reportProjectParseProgress(context, 90, "persisting-parse-results");

    const parseStatsJson = {
      totalFileCount,
      sourceFileCount,
      parsedFileCount,
      dependencyCount,
      skippedFileCount,
      errorFileCount,
    };

    if (errorFileCount > 0) {
      await projectService.markParseAsPartial({
        projectImportId: importId,
        parseError: `${errorFileCount} file(s) could not be parsed completely`,
        indexedFileCount: totalFileCount,
        indexedSymbolCount,
        indexedEdgeCount: dependencyCount,
        parseStatsJson,
      });
    } else {
      await projectService.markParseAsCompleted({
        projectImportId: importId,
        indexedFileCount: totalFileCount,
        indexedSymbolCount,
        indexedEdgeCount: dependencyCount,
        parseStatsJson,
      });
    }

    await reportProjectParseProgress(context, 100, "completed");
  } catch (error) {
    await projectService.markParseAsFailed(
      importId,
      toParseFailureMessage(error),
    );
    throw error;
  }
}
