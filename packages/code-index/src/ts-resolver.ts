import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { IGNORED_NAMES, normalizeRepositoryFilePath } from "./file-discovery.js";

export interface TypeScriptPathAliasPattern {
  pattern: string;
  hasWildcard: boolean;
  prefix: string;
  suffix: string;
  targets: string[];
}

export interface TypeScriptResolverConfig {
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

export function normalizeWorkspaceRelativePath(
  workspacePath: string,
  targetPath: string,
) {
  const relativePath = path.relative(workspacePath, targetPath);
  if (!relativePath) return "";
  return normalizeRepositoryFilePath(relativePath.split(path.sep).join("/"));
}

function readTsConfigFile(configPath: string) {
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) return null;
  return readResult.config as {
    extends?: string;
    compilerOptions?: TypeScriptCompilerOptionsConfig;
  };
}

async function readTypeScriptCompilerOptionsConfig(
  configPath: string,
  visited = new Set<string>(),
): Promise<TypeScriptCompilerOptionsConfig | null> {
  if (visited.has(configPath)) return null;
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
    if (entryStats.isSymbolicLink()) return;

    const name = path.basename(absolutePath);

    if (entryStats.isDirectory()) {
      if (IGNORED_NAMES.has(name)) return;

      const entries = await readdir(absolutePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await visit(path.join(absolutePath, entry.name));
          continue;
        }
        if (entry.isFile() && (entry.name === "tsconfig.json" || entry.name === "jsconfig.json")) {
          discoveredConfigs.add(path.join(absolutePath, entry.name));
        }
      }
    }
  }

  for (const relativePath of configRelativePaths) {
    discoveredConfigs.add(path.join(workspacePath, relativePath));
  }

  await visit(workspacePath);

  const resolverConfigs: TypeScriptResolverConfig[] = [];

  for (const configPath of discoveredConfigs) {
    try {
      const compilerOptions = await readTypeScriptCompilerOptionsConfig(configPath);

      if (!compilerOptions?.paths) continue;

      const configDirPath = path.dirname(configPath);
      const baseUrlPath = path.resolve(configDirPath, compilerOptions.baseUrl ?? ".");
      const pathAliases = Object.entries(compilerOptions.paths ?? {})
        .filter(([, targets]) => Array.isArray(targets) && targets.length > 0)
        .map(([pattern, targets]) => {
          const wildcardIndex = pattern.indexOf("*");
          return {
            pattern,
            hasWildcard: wildcardIndex >= 0,
            prefix: wildcardIndex >= 0 ? pattern.slice(0, wildcardIndex) : pattern,
            suffix: wildcardIndex >= 0 ? pattern.slice(wildcardIndex + 1) : "",
            targets,
          };
        });

      if (pathAliases.length === 0) continue;

      resolverConfigs.push({
        configPath,
        configDirPath,
        configDirRelativePath: normalizeWorkspaceRelativePath(workspacePath, configDirPath),
        baseUrlPath,
        pathAliases,
      });
    } catch (error) {
      console.log(`Failed to read TypeScript resolver config at ${configPath}`, error);
    }
  }

  return resolverConfigs.sort(
    (left, right) => right.configDirPath.length - left.configDirPath.length,
  );
}

/**
 * Workspace package name → source directory mapping.
 * e.g. { "@codemap-ai/core": "packages/core/src" }
 */
export interface WorkspacePackageMap {
  [packageName: string]: string; // workspace-relative source dir
}

/**
 * Scan workspace for package.json files and build a map of
 * package name → workspace-relative source directory.
 * Checks for src/ dir first, falls back to package root.
 * ponytail: no exports field parsing — add when subpath imports needed
 */
export async function loadWorkspacePackageMap(
  workspacePath: string,
): Promise<WorkspacePackageMap> {
  const map: WorkspacePackageMap = {};
  const pkgDirs: string[] = [];

  // Read pnpm-workspace.yaml or package.json workspaces
  try {
    const rootPkg = JSON.parse(await readFile(path.join(workspacePath, "package.json"), "utf8"));
    if (Array.isArray(rootPkg.workspaces)) {
      pkgDirs.push(...rootPkg.workspaces);
    }
  } catch { /* no root package.json */ }

  if (pkgDirs.length === 0) {
    try {
      const yamlContent = await readFile(path.join(workspacePath, "pnpm-workspace.yaml"), "utf8");
      // Simple YAML array parse — covers "- 'packages/*'" pattern
      for (const line of yamlContent.split("\n")) {
        const m = line.match(/^\s*-\s+['"]?([^'"]+)['"]?\s*$/);
        if (m) pkgDirs.push(m[1]);
      }
    } catch { /* no pnpm-workspace.yaml */ }
  }

  if (pkgDirs.length === 0) return map;

  // Expand glob patterns like "packages/*"
  const expandedDirs: string[] = [];
  for (const pattern of pkgDirs) {
    if (pattern.endsWith("/*")) {
      const parentDir = path.join(workspacePath, pattern.slice(0, -2));
      try {
        const entries = await readdir(parentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            expandedDirs.push(path.join(parentDir, entry.name));
          }
        }
      } catch { /* dir doesn't exist */ }
    } else {
      expandedDirs.push(path.join(workspacePath, pattern));
    }
  }

  for (const dir of expandedDirs) {
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
      if (!pkg.name) continue;
      const relDir = path.relative(workspacePath, dir).split(path.sep).join("/");
      // Prefer src/ subdir if it exists
      try {
        const srcStat = await lstat(path.join(dir, "src"));
        if (srcStat.isDirectory()) {
          map[pkg.name] = relDir + "/src";
          continue;
        }
      } catch { /* no src/ dir */ }
      map[pkg.name] = relDir;
    } catch { /* no package.json in this dir */ }
  }

  return map;
}
