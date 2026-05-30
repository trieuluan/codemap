import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import JSZip from "jszip";

// Directories never included in the zip
const ARTIFACT_EXCLUDES = new Set([
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
  ".gradle",
  "target",         // Java/Rust build output
  ".terraform",
]);

// File name patterns excluded from the zip — sensitive files
const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /^\.env$/i,
  /^\.env\./i,       // .env.local, .env.production, etc.
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

// Directory names considered sensitive — entire directory excluded
const SENSITIVE_DIR_NAMES = new Set([".aws", ".ssh", ".gnupg"]);

function isSensitiveFile(name: string): boolean {
  return SENSITIVE_FILE_PATTERNS.some((p) => p.test(name));
}

async function readGitignorePatterns(dirPath: string): Promise<Set<string>> {
  try {
    const content = await readFile(path.join(dirPath, ".gitignore"), "utf-8");
    const patterns = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.replace(/^\//, "").replace(/\/$/, ""));
    return new Set(patterns);
  } catch {
    return new Set();
  }
}

async function addDirToZip(
  zip: JSZip,
  dirPath: string,
  zipPrefix: string,
  gitignorePatterns: Set<string>,
): Promise<{ addedCount: number; skippedSensitive: string[] }> {
  const skippedSensitive: string[] = [];
  let addedCount = 0;

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return { addedCount, skippedSensitive };
  }

  for (const entry of entries) {
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (
        ARTIFACT_EXCLUDES.has(entry.name) ||
        gitignorePatterns.has(entry.name) ||
        gitignorePatterns.has(`${entry.name}/`)
      ) {
        continue;
      }

      if (SENSITIVE_DIR_NAMES.has(entry.name)) {
        skippedSensitive.push(zipPath + "/");
        continue;
      }

      const result = await addDirToZip(
        zip,
        path.join(dirPath, entry.name),
        zipPath,
        gitignorePatterns,
      );
      addedCount += result.addedCount;
      skippedSensitive.push(...result.skippedSensitive);
    } else if (entry.isFile()) {
      if (gitignorePatterns.has(entry.name)) continue;

      if (isSensitiveFile(entry.name)) {
        skippedSensitive.push(zipPath);
        continue;
      }

      try {
        const content = await readFile(path.join(dirPath, entry.name));
        zip.file(zipPath, content);
        addedCount++;
      } catch {
        // Skip files that can't be read (permission errors, etc.)
      }
    }
  }

  return { addedCount, skippedSensitive };
}

export interface ZipWorkspaceResult {
  buffer: Buffer;
  addedCount: number;
  skippedSensitive: string[];
}

/**
 * Creates a zip Buffer from a workspace folder.
 * Automatically excludes artifact directories, gitignore patterns,
 * and sensitive files (secrets, keys, credentials).
 */
export async function zipWorkspaceFolder(
  folderPath: string,
): Promise<ZipWorkspaceResult> {
  const zip = new JSZip();
  const gitignorePatterns = await readGitignorePatterns(folderPath);

  const { addedCount, skippedSensitive } = await addDirToZip(
    zip,
    folderPath,
    "",
    gitignorePatterns,
  );

  const buffer = (await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })) as Buffer;

  return { buffer, addedCount, skippedSensitive };
}
