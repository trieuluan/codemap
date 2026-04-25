import path from "node:path";
import type { RepoExternalSymbolInsert } from "../../../../db/schema";
import type { TypeScriptResolverConfig } from "../ts-resolver";

export const JS_TS_EXTENSIONS = ["ts", "tsx", "js", "jsx"];
export const DART_EXTENSIONS = ["dart"];
export const PHP_EXTENSIONS = ["php"];

export function buildLocalSymbolKey(filePath: string, kind: string, displayName: string) {
  return `${filePath}#${kind}:${displayName}`;
}

export function buildStableSymbolKey(filePath: string, kind: string, displayName: string, line: number) {
  return `${filePath}#${kind}:${displayName}:${line}`;
}

export function buildImportLocalKey(
  filePath: string,
  importKind: string,
  moduleSpecifier: string,
  line: number,
  col: number,
) {
  return `${filePath}#${importKind}:${moduleSpecifier}:${line}:${col}`;
}

export function resolveRelativeTargetPath(
  sourceFilePath: string,
  moduleSpecifier: string,
  language: string,
  filePathSet: Set<string>,
) {
  const basePath = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourceFilePath), moduleSpecifier),
  );
  const extensions =
    language === "Dart" ? DART_EXTENSIONS
    : language === "PHP" ? PHP_EXTENSIONS
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

  const resolvedPath = candidates.find((candidate) => filePathSet.has(candidate));
  return { resolvedPath: resolvedPath ?? null, attemptedPath: basePath };
}

export function findBestResolverConfig(
  sourceFilePath: string,
  resolverConfigs: TypeScriptResolverConfig[],
) {
  return (
    resolverConfigs.find((config) => {
      const configRelativeDir = config.configDirRelativePath;
      if (!configRelativeDir) return true;
      return (
        path.posix.dirname(sourceFilePath).startsWith(`${configRelativeDir}/`) ||
        path.posix.dirname(sourceFilePath) === configRelativeDir
      );
    }) ?? null
  );
}

export function resolveTsconfigAliasTargetPath(
  workspacePath: string,
  sourceFilePath: string,
  moduleSpecifier: string,
  language: string,
  filePathSet: Set<string>,
  resolverConfigs: TypeScriptResolverConfig[],
) {
  const resolverConfig = findBestResolverConfig(sourceFilePath, resolverConfigs);
  if (!resolverConfig) return null;

  const extensions =
    language === "TypeScript" || language === "JavaScript" ? JS_TS_EXTENSIONS
    : language === "Dart" ? DART_EXTENSIONS
    : PHP_EXTENSIONS;

  for (const alias of resolverConfig.pathAliases) {
    let wildcardValue = "";

    if (alias.hasWildcard) {
      if (!moduleSpecifier.startsWith(alias.prefix) || !moduleSpecifier.endsWith(alias.suffix)) continue;
      wildcardValue = moduleSpecifier.slice(alias.prefix.length, moduleSpecifier.length - alias.suffix.length);
    } else if (moduleSpecifier !== alias.pattern) {
      continue;
    }

    for (const targetPattern of alias.targets) {
      const targetValue = alias.hasWildcard ? targetPattern.replace(/\*/g, wildcardValue) : targetPattern;
      const candidateBasePath = path.resolve(resolverConfig.baseUrlPath, targetValue);

      // normalizeWorkspaceRelativePath inline to avoid circular dep
      const relativePath = path.relative(workspacePath, candidateBasePath);
      const candidateRelativeBasePath = relativePath
        ? relativePath.split(path.sep).join("/").replace(/^\.\//, "")
        : "";

      const candidates = [candidateRelativeBasePath];
      if (!path.posix.extname(candidateRelativeBasePath)) {
        for (const extension of extensions) {
          candidates.push(`${candidateRelativeBasePath}.${extension}`);
          candidates.push(`${candidateRelativeBasePath}/index.${extension}`);
        }
      }

      const resolvedPath = candidates.find((candidate) => filePathSet.has(candidate));

      if (resolvedPath) {
        return { matched: true, resolvedPath, attemptedPath: candidateRelativeBasePath };
      }

      return { matched: true, resolvedPath: null, attemptedPath: candidateRelativeBasePath };
    }
  }

  return null;
}

export function maskCommentsAndTemplateLiterals(
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
      if (char === "\n" || char === "\r") { state = "code"; }
      else { maskChar(index); }
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && nextChar === "/") {
        maskChar(index); maskChar(index + 1); index += 2; state = "code"; continue;
      }
      maskChar(index); index += 1; continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      if (state === "template") maskChar(index);
      if (char === "\\") { if (state === "template") maskChar(index + 1); index += 2; continue; }
      if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
        state = "code";
      }
      index += 1; continue;
    }

    if (char === "/" && nextChar === "/") { maskChar(index); maskChar(index + 1); index += 2; state = "line-comment"; continue; }
    if (options.hashLineComments && char === "#") { maskChar(index); index += 1; state = "line-comment"; continue; }
    if (char === "/" && nextChar === "*") { maskChar(index); maskChar(index + 1); index += 2; state = "block-comment"; continue; }

    if (char === "'") state = "single";
    else if (char === '"') state = "double";
    else if (char === "`") { maskChar(index); state = "template"; }

    index += 1;
  }

  return chars.join("");
}

export function createExternalSymbolDraft(
  projectImportId: string,
  language: string,
  moduleSpecifier: string,
): RepoExternalSymbolInsert {
  return {
    projectImportId,
    symbolKey: `${language.toLowerCase()}:${moduleSpecifier}`,
    packageManager: language === "Dart" ? "pub" : language === "PHP" ? "composer" : "npm",
    packageName: moduleSpecifier,
    packageVersion: null,
    language,
    displayName: moduleSpecifier,
    kind: language === "PHP" ? "namespace" : "module",
    documentationJson: null,
    extraJson: null,
  };
}
