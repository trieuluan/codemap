import { readdir, lstat } from "node:fs/promises";
import path from "node:path";

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

export interface ProjectTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  extension?: string | null;
  children?: ProjectTreeNode[];
}

function toRelativePath(rootPath: string, targetPath: string) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath ? relativePath.split(path.sep).join("/") : "";
}

function compareTreeNodes(left: ProjectTreeNode, right: ProjectTreeNode) {
  if (left.type !== right.type) {
    return left.type === "directory" ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

async function buildNode(rootPath: string, absolutePath: string): Promise<ProjectTreeNode | null> {
  const stats = await lstat(absolutePath);

  if (stats.isSymbolicLink()) {
    return null;
  }

  const name = path.basename(absolutePath);
  const relativePath = toRelativePath(rootPath, absolutePath);

  if (stats.isDirectory()) {
    if (IGNORED_NAMES.has(name)) {
      return null;
    }

    const entries = await readdir(absolutePath, { withFileTypes: true });
    const children = (
      await Promise.all(
        entries.map((entry) => buildNode(rootPath, path.join(absolutePath, entry.name))),
      )
    )
      .filter((node): node is ProjectTreeNode => node !== null)
      .sort(compareTreeNodes);

    return {
      name,
      path: relativePath,
      type: "directory",
      children,
    };
  }

  if (!stats.isFile()) {
    return null;
  }

  return {
    name,
    path: relativePath,
    type: "file",
    extension: path.extname(name).slice(1) || null,
  };
}

export async function buildProjectTree(rootPath: string, rootName?: string) {
  const rootNode = await buildNode(rootPath, rootPath);

  if (!rootNode || rootNode.type !== "directory") {
    throw new Error("Unable to build project tree from workspace");
  }

  return {
    ...rootNode,
    name: rootName ?? rootNode.name,
  } satisfies ProjectTreeNode;
}
