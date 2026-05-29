import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Returns the package root directory.
 *
 * Works in both source (tsx) and bundled (tsup dist/) runtimes.
 * Pass the caller's own `import.meta.url` so the result is relative to the
 * actual file location.
 */
export function getPackageRoot(callerImportMetaUrl: string): string {
  const callerDir = path.dirname(fileURLToPath(callerImportMetaUrl));

  // Source (tsx): caller is somewhere under <pkg>/src/… → go up to src/ then one more.
  const srcIdx = callerDir.lastIndexOf(`${path.sep}src${path.sep}`);
  if (srcIdx !== -1) {
    return path.resolve(callerDir.slice(0, srcIdx));
  }

  // Bundled (tsup): caller is at <pkg>/dist/ → go up one level.
  return path.resolve(callerDir, "..");
}
