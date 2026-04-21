import type { ProjectMapTreeNode } from "@/features/projects/api";
import { getFileKind, getLanguageByExtension, type FileKind } from "@/lib/file-types";

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
  const children = isFolder ? (node.children ?? []) : undefined;
  const uniqueChildren = children
    ? [
        ...new Map(
          children.map((child) => [child.path || child.name, child]),
        ).values(),
      ]
    : undefined;

  return {
    id: node.path || node.name,
    name: node.name,
    path: node.path,
    type: isFolder ? "folder" : "file",
    extension: node.extension ?? null,
    language: isFolder ? undefined : getLanguageByExtension(node.extension),
    children: uniqueChildren?.map(mapProjectTreeToRepositoryNode),
  };
}

export function mapProjectTreeToRepositoryNodes(
  tree?: ProjectMapTreeNode | null,
) {
  return tree?.children?.map(mapProjectTreeToRepositoryNode) ?? [];
}

export function getRepositoryNodeKind(node: RepositoryTreeNode): FileKind {
  return getFileKind({
    name: node.name,
    extension: node.extension,
    isDirectory: node.type === "folder",
  });
}

export function getRepositoryNodeChildCount(node: RepositoryTreeNode) {
  return node.children?.length ?? 0;
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

export function findRepositoryNodeByPath(
  nodes: RepositoryTreeNode[],
  nodePath?: string | null,
) {
  if (!nodePath) {
    return null;
  }

  return findRepositoryNodeById(nodes, nodePath);
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

export function getAncestorNodeIdsByPath(
  nodes: RepositoryTreeNode[],
  nodePath?: string | null,
) {
  if (!nodePath) {
    return [];
  }

  return getAncestorNodeIds(nodes, nodePath);
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

export function collectRepositoryLanguages(nodes: RepositoryTreeNode[]) {
  const languages = new Set<string>();

  function walk(currentNodes: RepositoryTreeNode[]) {
    for (const node of currentNodes) {
      if (node.language) {
        languages.add(node.language);
      }

      if (node.children?.length) {
        walk(node.children);
      }
    }
  }

  walk(nodes);

  return Array.from(languages).sort((left, right) => left.localeCompare(right));
}

export function collectRepositoryKinds(nodes: RepositoryTreeNode[]) {
  const kinds = new Set<FileKind>();

  function walk(currentNodes: RepositoryTreeNode[]) {
    for (const node of currentNodes) {
      kinds.add(getRepositoryNodeKind(node));

      if (node.children?.length) {
        walk(node.children);
      }
    }
  }

  walk(nodes);

  return Array.from(kinds).sort((left, right) => left.localeCompare(right));
}

export function filterRepositoryTree(
  nodes: RepositoryTreeNode[],
  options?: {
    query?: string;
    kind?: FileKind | "all";
    language?: string | "all";
  },
) {
  const normalizedQuery = options?.query?.trim().toLowerCase() ?? "";
  const normalizedKind = options?.kind ?? "all";
  const normalizedLanguage = options?.language ?? "all";

  if (!normalizedQuery && normalizedKind === "all" && normalizedLanguage === "all") {
    return nodes;
  }

  function nodeMatches(node: RepositoryTreeNode) {
    const matchesQuery =
      !normalizedQuery ||
      node.name.toLowerCase().includes(normalizedQuery) ||
      node.path?.toLowerCase().includes(normalizedQuery);

    const nodeKind = getRepositoryNodeKind(node);
    const matchesKind = normalizedKind === "all" || nodeKind === normalizedKind;
    const matchesLanguage =
      normalizedLanguage === "all" || node.language === normalizedLanguage;

    if (node.type === "folder") {
      return matchesQuery && matchesKind && normalizedLanguage === "all";
    }

    return matchesQuery && matchesKind && matchesLanguage;
  }

  function walk(currentNodes: RepositoryTreeNode[]): RepositoryTreeNode[] {
    const nextNodes: RepositoryTreeNode[] = [];

    for (const node of currentNodes) {
      const filteredChildren = node.children?.length ? walk(node.children) : undefined;
      const includeNode = nodeMatches(node) || Boolean(filteredChildren?.length);

      if (!includeNode) {
        continue;
      }

      nextNodes.push({
        ...node,
        children: filteredChildren,
      });
    }

    return nextNodes;
  }

  return walk(nodes);
}
