"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type {
  NodeRendererProps,
  RowRendererProps,
  TreeApi,
} from "react-arborist";
import { Tree } from "react-arborist";
import { getFileIconMeta } from "@/lib/file-icons";
import { cn } from "@/lib/utils";
import {
  buildOpenState,
  collectFolderNodeIds,
  type RepositoryTreeNode,
} from "./file-tree-model";

interface FileTreeProps {
  tree: RepositoryTreeNode[];
  selectedNodeId?: string;
  expandedNodeIds: string[];
  onSelectNode: (node: RepositoryTreeNode) => void;
  onExpandedChange: (ids: string[]) => void;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize({ width, height });
    };

    updateSize();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return {
    ref,
    width: Math.floor(size.width),
    height: Math.floor(size.height),
  };
}

function FileTreeRow({
  node,
  attrs,
  innerRef,
  children,
}: RowRendererProps<RepositoryTreeNode>) {
  return (
    <div
      {...attrs}
      ref={innerRef}
      onClick={() => {
        node.select();
        node.focus();
      }}
      onDoubleClick={() => {
        if (node.data.type === "folder") {
          node.toggle();
        }
      }}
      className={cn("outline-hidden", attrs.className)}
    >
      {children}
    </div>
  );
}

function FileTreeNode({ node, style }: NodeRendererProps<RepositoryTreeNode>) {
  const isFolder = node.data.type === "folder";
  const iconClassName = "h-4 w-4 flex-shrink-0";
  const { Icon, className: iconColorClassName } = getFileIconMeta({
    name: node.data.name,
    extension: node.data.extension,
    isDirectory: isFolder,
    isOpen: node.isOpen,
  });

  return (
    <div
      style={style}
      className={cn(
        "mx-2 flex h-8 min-w-0 items-center gap-1 rounded-md px-2 text-sm transition-colors",
        node.isSelected
          ? "bg-sidebar-border ring-1 ring-sidebar-ring ring-inset text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/30",
        node.isFocused && "ring-2 ring-sidebar-ring ring-inset",
      )}
    >
      {isFolder ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={node.isOpen ? "Collapse folder" : "Expand folder"}
          className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          onClick={(event) => {
            event.stopPropagation();
            node.toggle();
          }}
        >
          {node.isOpen ? (
            <ChevronDown className={iconClassName} />
          ) : (
            <ChevronRight className={iconClassName} />
          )}
        </button>
      ) : (
        <span className="w-5 flex-shrink-0" aria-hidden="true" />
      )}
      <Icon className={cn(iconClassName, iconColorClassName)} />
      <span className="min-w-0 flex-1 truncate">{node.data.name}</span>
      {!isFolder && node.data.size ? (
        <span className="ml-2 text-xs text-muted-foreground">
          {(node.data.size / 1024).toFixed(1)}kb
        </span>
      ) : null}
    </div>
  );
}

export function FileTree({
  tree,
  selectedNodeId,
  expandedNodeIds,
  onSelectNode,
  onExpandedChange,
}: FileTreeProps) {
  const titleId = useId();
  const descriptionId = useId();
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const treeRef = useRef<TreeApi<RepositoryTreeNode> | null>(null);
  const isSyncingOpenStateRef = useRef(false);
  const folderNodeIds = useMemo(() => collectFolderNodeIds(tree), [tree]);
  const initialOpenState = useMemo(
    () => buildOpenState(expandedNodeIds),
    [expandedNodeIds],
  );

  const handleToggle = useCallback(
    (nodeId: string) => {
      if (isSyncingOpenStateRef.current) {
        return;
      }

      const treeApi = treeRef.current;
      const isOpen = treeApi?.isOpen(nodeId) ?? false;

      onExpandedChange(
        isOpen
          ? [...new Set([...expandedNodeIds, nodeId])]
          : expandedNodeIds.filter((currentId) => currentId !== nodeId),
      );
    },
    [expandedNodeIds, onExpandedChange],
  );

  useEffect(() => {
    const treeApi = treeRef.current;

    if (!treeApi) {
      return;
    }

    isSyncingOpenStateRef.current = true;

    try {
      const expandedNodeIdSet = new Set(expandedNodeIds);

      for (const folderNodeId of folderNodeIds) {
        const shouldBeOpen = expandedNodeIdSet.has(folderNodeId);
        const isOpen = treeApi.isOpen(folderNodeId);

        if (shouldBeOpen && !isOpen) {
          treeApi.open(folderNodeId);
        }

        if (!shouldBeOpen && isOpen) {
          treeApi.close(folderNodeId);
        }
      }
    } finally {
      isSyncingOpenStateRef.current = false;
    }
  }, [expandedNodeIds, folderNodeIds]);

  return (
    <section
      role="region"
      className="flex h-full min-h-0 flex-col"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="border-b border-sidebar-border px-4 py-3">
        <h3 id={titleId} className="text-sm font-semibold text-foreground">
          Files
        </h3>
        <p id={descriptionId} className="sr-only">
          Repository files. Use the arrow keys to move, expand, and collapse
          folders.
        </p>
      </div>
      <div ref={ref} className="min-h-0 flex-1 py-2">
        {height > 0 ? (
          <Tree
            ref={treeRef}
            data={tree}
            width={width || "100%"}
            height={Math.max(height, 1)}
            rowHeight={32}
            indent={16}
            padding={8}
            openByDefault={false}
            disableDrag
            disableDrop
            disableEdit
            disableMultiSelection
            selection={selectedNodeId}
            selectionFollowsFocus
            initialOpenState={initialOpenState}
            onSelect={(nodes) => {
              const [selectedNode] = nodes;

              if (selectedNode) {
                onSelectNode(selectedNode.data);
              }
            }}
            onToggle={handleToggle}
            rowClassName="outline-hidden"
            renderRow={FileTreeRow}
          >
            {FileTreeNode}
          </Tree>
        ) : null}
      </div>
    </section>
  );
}
