import type { ProjectMapTreeNode } from "@/lib/api/projects";
import { getLanguageByExtension } from "@/lib/file-types";

export interface RepositoryTreeNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path?: string;
  extension?: string | null;
  language?: string;
  size?: number;
  children?: RepositoryTreeNode[];
}

export function mapProjectTreeToRepositoryNode(
  node: ProjectMapTreeNode,
): RepositoryTreeNode {
  const isFolder = node.type === "directory";

  return {
    id: node.path || node.name,
    name: node.name,
    path: node.path,
    type: isFolder ? "folder" : "file",
    extension: node.extension ?? null,
    language: isFolder ? undefined : getLanguageByExtension(node.extension),
    children: isFolder
      ? (node.children?.map(mapProjectTreeToRepositoryNode) ?? [])
      : undefined,
  };
}

export function mapProjectTreeToRepositoryNodes(
  tree?: ProjectMapTreeNode | null,
) {
  console.log(tree);
  return tree?.children?.map(mapProjectTreeToRepositoryNode) ?? [];
}

export function findRepositoryNodeById(
  nodes: RepositoryTreeNode[],
  nodeId?: string | null,
): RepositoryTreeNode | null {
  if (!nodeId) {
    return null;
  }

  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.children?.length) {
      const nestedMatch = findRepositoryNodeById(node.children, nodeId);

      if (nestedMatch) {
        return nestedMatch;
      }
    }
  }

  return null;
}

export function getFirstSelectableRepositoryNode(
  nodes: RepositoryTreeNode[],
): RepositoryTreeNode | null {
  for (const node of nodes) {
    if (node.type === "file") {
      return node;
    }

    if (node.children?.length) {
      return getFirstSelectableRepositoryNode(node.children) ?? node;
    }
  }

  return nodes[0] ?? null;
}

export function getAncestorNodeIds(
  nodes: RepositoryTreeNode[],
  nodeId?: string | null,
) {
  if (!nodeId) {
    return [];
  }

  const ancestors: string[] = [];

  function walk(
    currentNodes: RepositoryTreeNode[],
    parentIds: string[],
  ): boolean {
    for (const node of currentNodes) {
      if (node.id === nodeId) {
        ancestors.push(...parentIds);
        return true;
      }

      if (node.children?.length) {
        if (walk(node.children, [...parentIds, node.id])) {
          return true;
        }
      }
    }

    return false;
  }

  walk(nodes, []);

  return ancestors;
}

export function collectFolderNodeIds(nodes: RepositoryTreeNode[]) {
  const folderIds: string[] = [];

  function walk(currentNodes: RepositoryTreeNode[]) {
    for (const node of currentNodes) {
      if (node.type === "folder") {
        folderIds.push(node.id);
      }

      if (node.children?.length) {
        walk(node.children);
      }
    }
  }

  walk(nodes);

  return folderIds;
}

export function pruneExpandedNodeIds(
  nodes: RepositoryTreeNode[],
  expandedNodeIds: string[],
) {
  return expandedNodeIds.filter((nodeId) => {
    const node = findRepositoryNodeById(nodes, nodeId);
    return node?.type === "folder";
  });
}

export function buildOpenState(expandedNodeIds: string[]) {
  return Object.fromEntries(expandedNodeIds.map((nodeId) => [nodeId, true]));
}
