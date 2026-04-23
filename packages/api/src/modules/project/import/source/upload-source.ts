import path from "node:path";
import { mkdtemp, readdir, rm, unlink } from "node:fs/promises";
import os from "node:os";
import AdmZip from "adm-zip";

// Directory names always excluded when extracting uploads
const IGNORED_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".turbo",
  ".cache",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "venv",
  ".venv",
  "vendor",
]);

// File name patterns considered sensitive — removed server-side as a safety net
const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /^\.env$/i,
  /^\.env\./i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.cer$/i,
  /\.crt$/i,
  /\.der$/i,
  /\.keystore$/i,
  /\.jks$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /\.tfvars$/i,
  /^secrets\.(json|yaml|yml|toml|env)$/i,
  /^credentials\.(json|yaml|yml|toml)$/i,
  /^service.?account.*\.json$/i,
  /^google.*credentials.*\.json$/i,
];

// Directory names considered sensitive — entire directory removed
const SENSITIVE_DIR_NAMES = new Set([".aws", ".ssh", ".gnupg"]);

function isSensitiveFileName(name: string): boolean {
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

async function filterSensitiveFiles(dirPath: string): Promise<string[]> {
  const removed: string[] = [];

  async function scan(currentPath: string) {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (SENSITIVE_DIR_NAMES.has(entry.name) || IGNORED_DIR_NAMES.has(entry.name)) {
          await rm(fullPath, { recursive: true, force: true });
          removed.push(path.relative(dirPath, fullPath));
        } else {
          await scan(fullPath);
        }
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (isSensitiveFileName(entry.name)) {
          await unlink(fullPath).catch(() => undefined);
          removed.push(path.relative(dirPath, fullPath));
        }
      }
    }
  }

  await scan(dirPath);
  return removed;
}

export interface PreparedUploadSource {
  /** Path to the prepared workspace — ready for local_workspace pipeline */
  workspacePath: string;
  repoName: string;
  removedSensitiveFiles: string[];
  cleanup: () => Promise<void>;
}

/**
 * Extracts a zip buffer into a temp directory and removes sensitive files.
 * No git repository is created — the local_workspace pipeline handles
 * non-git directories gracefully (branch and commitSha will be null).
 */
export async function extractAndPrepareUploadSource(
  zipBuffer: Buffer,
  options?: { repoName?: string },
): Promise<PreparedUploadSource> {
  const repoName = (options?.repoName ?? "uploaded-project")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 100);

  const tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "codemap-upload-"),
  );
  const workspacePath = path.join(tempRoot, repoName);

  try {
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(workspacePath, /* overwrite */ true);

    // Server-side safety net: strip sensitive files even if MCP already filtered
    const removedSensitiveFiles = await filterSensitiveFiles(workspacePath);

    return {
      workspacePath,
      repoName,
      removedSensitiveFiles,
      cleanup: async () => {
        await rm(tempRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}
