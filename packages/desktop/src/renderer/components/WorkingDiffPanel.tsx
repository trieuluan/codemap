import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderTree, GitBranch, RefreshCw, Search } from "lucide-react";
import { DiffPreview } from "./ui/diff/preview.js";
import { parseDiff } from "./ui/diff/utils/parse.js";

type DiffStatus = "idle" | "loading" | "error";

interface FileNode {
  name: string;
  path: string;
  children: FileNode[];
  isFile: boolean;
}

interface DiffStats {
  added: number;
  deleted: number;
}

function parseStats(diff: string): DiffStats {
  let added = 0;
  let deleted = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) deleted++;
  }
  return { added, deleted };
}

function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];

  for (const fullPath of paths) {
    const parts = fullPath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const isFile = i === parts.length - 1;
      const name = parts[i];
      const currentPath = parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name);

      if (!existing) {
        existing = {
          name,
          path: currentPath,
          children: [],
          isFile,
        };
        current.push(existing);
      } else if (isFile) {
        existing.isFile = true;
      }

      current = existing.children;
    }
  }

  return root;
}

function filterTree(
  nodes: FileNode[],
  search: string,
): { nodes: FileNode[]; visibleCount: number } {
  if (!search.trim()) return { nodes, visibleCount: countFiles(nodes) };

  const lower = search.toLowerCase();

  function filter(nodes: FileNode[]): FileNode[] {
    const result: FileNode[] = [];
    for (const node of nodes) {
      if (node.isFile) {
        if (node.name.toLowerCase().includes(lower)) {
          result.push(node);
        }
      } else {
        const filteredChildren = filter(node.children);
        const selfMatch = node.name.toLowerCase().includes(lower);
        if (filteredChildren.length > 0 || selfMatch) {
          result.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          });
        }
      }
    }
    return result;
  }

  const filtered = filter(nodes);
  return { nodes: filtered, visibleCount: countFiles(filtered) };
}

function countFiles(nodes: FileNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.isFile) count++;
    count += countFiles(node.children);
  }
  return count;
}

function FileTreeItem({
  node,
  depth,
  onFileClick,
  defaultExpanded,
}: {
  node: FileNode;
  depth: number;
  onFileClick: (path: string) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (node.isFile) {
    return (
      <div
        className="file-tree-file"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onFileClick(node.path)}
        title={node.path}
      >
        <span className="file-tree-name">{node.name}</span>
      </div>
    );
  }

  const hasChildren = node.children.length > 0;
  return (
    <>
      <div
        className="file-tree-dir"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`file-tree-arrow ${expanded ? "file-tree-arrow-open" : ""}`}>
          ▸
        </span>
        <span className="file-tree-name file-tree-dir-name">{node.name}/</span>
      </div>
      {hasChildren && expanded &&
        node.children.map((child, i) => (
          <FileTreeItem
            key={i}
            node={child}
            depth={depth + 1}
            onFileClick={onFileClick}
            defaultExpanded={depth < 1}
          />
        ))}
    </>
  );
}

export function WorkingDiffPanel() {
  const [diff, setDiff] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [status, setStatus] = useState<DiffStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDiff = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const [diffResult, branchResult] = await Promise.all([
        window.codemap.getWorkingDiff(),
        window.codemap.getBranchName(),
      ]);
      setDiff(diffResult);
      setBranch(branchResult || null);
      setStatus("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchDiff();
    intervalRef.current = setInterval(() => void fetchDiff(), 10_000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [fetchDiff]);

  const stats = useMemo(() => (diff ? parseStats(diff) : { added: 0, deleted: 0 }), [diff]);

  const filePaths = useMemo(() => {
    if (!diff) return [];
    const files = parseDiff(diff);
    return files.map((f) => f.newPath || f.oldPath || "").filter(Boolean);
  }, [diff]);

  const fileTree = useMemo(() => buildFileTree(filePaths), [filePaths]);

  const filteredTree = useMemo(() => filterTree(fileTree, search), [fileTree, search]);

  const handleFileClick = useCallback((filePath: string) => {
    const el = document.getElementById(`diff-file-${encodeURIComponent(filePath)}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const isEmpty = diff !== null && diff.trim() === "";
  const hasDiff = !error && diff && !isEmpty;

  return (
    <div className="diff-panel">
      <header className="diff-panel-head">
        <span className="diff-panel-title">
          <GitBranch size={13} />
          Working changes
          {branch && <span className="diff-branch-name">{branch}</span>}
        </span>
        <div className="flex items-center gap-2">
          {hasDiff && (stats.added > 0 || stats.deleted > 0) && (
            <span className="diff-stats">
              <span className="diff-stats-added">+{stats.added}</span>
              <span className="diff-stats-deleted">-{stats.deleted}</span>
            </span>
          )}
          <button
            className="icon-button"
            disabled={status === "loading"}
            onClick={() => void fetchDiff()}
            title="Refresh diff"
            type="button"
          >
            <RefreshCw size={13} className={status === "loading" ? "diff-spin" : ""} />
          </button>
        </div>
      </header>

      <div className="diff-panel-body">
        {status === "error" && error && (
          <p className="diff-panel-error">{error}</p>
        )}

        {!error && isEmpty && (
          <div className="diff-panel-empty">
            <GitBranch size={28} strokeWidth={1.5} />
            <p>No uncommitted changes</p>
          </div>
        )}

        {!error && diff && !isEmpty && (
          <>
            <div className="diff-panel-search">
              <Search size={13} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                className="diff-filter-input"
                placeholder="Filter files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="diff-panel-split">
              <div className="diff-panel-tree">
                <div className="diff-panel-tree-header">
                  <FolderTree size={13} />
                  <span>
                    {filteredTree.visibleCount} file
                    {filteredTree.visibleCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="diff-panel-tree-body">
                  {filteredTree.nodes.map((node, i) => (
                    <FileTreeItem
                      key={i}
                      node={node}
                      depth={0}
                      onFileClick={handleFileClick}
                      defaultExpanded
                    />
                  ))}
                </div>
              </div>

              <div className="diff-panel-content">
                <DiffPreview diff={diff} onFileClick={handleFileClick} />
              </div>
            </div>
          </>
        )}

        {!error && diff === null && status === "loading" && (
          <div className="diff-panel-empty">
            <p className="text-muted-foreground text-xs">Loading diff…</p>
          </div>
        )}
      </div>
    </div>
  );
}
