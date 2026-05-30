import { getPackages } from "@manypkg/get-packages";
import { spawnSync } from "node:child_process";

/**
 * Find the monorepo root directory from a given cwd.
 * Uses @manypkg/get-packages (supports pnpm/yarn/npm/bun workspaces).
 * Falls back to git toplevel, then cwd itself.
 */
export async function findMonorepoRoot(cwd: string): Promise<string> {
  try {
    const { rootDir } = await getPackages(cwd);
    return rootDir;
  } catch {
    // getPackages throws when no package.json found or not a monorepo.
    // Fall back to git toplevel.
    const git = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      cwd,
    });
    return git.stdout?.trim() || cwd;
  }
}
