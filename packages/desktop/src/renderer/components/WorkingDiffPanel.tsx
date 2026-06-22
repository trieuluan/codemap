import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Braces,
  Code2,
  Coffee,
  Database,
  FileCode,
  FileJson,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderTree,
  GitBranch,
  Image,
  Package,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Search,
  Settings,
  Terminal,
} from "lucide-react";
import type { WorkingDiffFile } from "../../shared/ipc.js";
import { MonacoDiffViewer } from "./MonacoDiffViewer.js";

function getFileIcon(filename: string): React.ReactNode {
  const lower = filename.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";

  // Special filenames
  if (lower === "package.json" || lower === "package-lock.json") return <Package size={13} />;
  if (lower === "tsconfig.json" || lower.startsWith("tsconfig.")) return <Settings size={13} />;
  if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".gitmodules") return <Terminal size={13} />;
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return <Terminal size={13} />;

  // By extension
  switch (ext) {
    case "ts":
    case "tsx":
      return <Code2 size={13} />;
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return <FileCode size={13} />;
    case "json":
    case "jsonc":
      return <FileJson size={13} />;
    case "css":
    case "scss":
    case "sass":
    case "less":
      return <Braces size={13} />;
    case "md":
    case "mdx":
    case "txt":
      return <FileText size={13} />;
    case "sql":
    case "prisma":
      return <Database size={13} />;
    case "java":
    case "kt":
    case "kts":
      return <Coffee size={13} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "ico":
      return <Image size={13} />;
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
    case "ps1":
      return <Terminal size={13} />;
    default:
      return <FileCode size={13} />;
  }
}

type DiffStatus = "idle" | "loading" | "error";
const FILE_SELECTOR_MIN_WIDTH = 180;
const FILE_SELECTOR_MAX_WIDTH = 420;
const FILE_SELECTOR_DEFAULT_WIDTH = 260;

interface FileNode {
  name: string;
  path: string;
  children: FileNode[];
  isFile: boolean;
}

function compactTree(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.isFile) {
      result.push(node);
    } else {
      const children = compactTree(node.children);
      if (children.length === 1 && !children[0].isFile) {
        // Collapse single-folder chain: "parent" + "child" → "parent/child"
        const child = children[0];
        result.push({
          ...child,
          name: node.name + "/" + child.name,
        });
      } else {
        result.push({ ...node, children });
      }
    }
  }
  return result;
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

  return compactTree(root);
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
  selectedPath,
}: {
  node: FileNode;
  depth: number;
  onFileClick: (path: string) => void;
  defaultExpanded: boolean;
  selectedPath: string | null;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (node.isFile) {
    return (
      <div
        className={`file-tree-file ${selectedPath === node.path ? "file-tree-file-active" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onFileClick(node.path)}
        title={node.path}
      >
        <span className="file-tree-icon">{getFileIcon(node.name)}</span>
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
        <span className="file-tree-icon">
          {expanded ? <FolderOpen size={13} /> : <FolderClosed size={13} />}
        </span>
        <span className="file-tree-name file-tree-dir-name">{node.name}</span>
      </div>
      <AnimatePresence initial={false}>
        {hasChildren && expanded && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            {node.children.map((child, i) => (
              <FileTreeItem
                key={i}
                node={child}
                depth={depth + 1}
                onFileClick={onFileClick}
                defaultExpanded={depth < 1}
                selectedPath={selectedPath}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function WorkingDiffPanel() {
  const [files, setFiles] = useState<WorkingDiffFile[] | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [status, setStatus] = useState<DiffStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileSelectorVisible, setFileSelectorVisible] = useState(true);
  const [fileTreeWidth, setFileTreeWidth] = useState(FILE_SELECTOR_DEFAULT_WIDTH);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const treeResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const filesRef = useRef<typeof files>(null);

  const fetchDiff = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const [fileResult, branchResult] = await Promise.all([
        window.codemap.getWorkingDiffFiles(),
        window.codemap.getBranchName(),
      ]);
      // Only update files state when content actually changed to avoid
      // unnecessary Monaco re-mounts on every poll tick.
      // Compare lightweight metadata only — not full file content strings.
      const sig = (f: typeof fileResult) =>
        f.map((x) => `${x.path}|${x.status}|${x.additions}|${x.deletions}`).join(",");
      const nextJson = sig(fileResult);
      const prevJson = filesRef.current ? sig(filesRef.current) : null;
      if (nextJson !== prevJson) {
        filesRef.current = fileResult;
        setFiles(fileResult);
        setSelectedPath((current) =>
          current && fileResult.some((file) => file.path === current)
            ? current
            : fileResult[0]?.path ?? null,
        );
      }
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

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!treeResizeStateRef.current) return;
      const next = treeResizeStateRef.current.startWidth + (treeResizeStateRef.current.startX - event.clientX);
      setFileTreeWidth(Math.max(FILE_SELECTOR_MIN_WIDTH, Math.min(next, FILE_SELECTOR_MAX_WIDTH)));
    }

    function handlePointerUp() {
      treeResizeStateRef.current = null;
      document.body.classList.remove("diff-panel-resizing");
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("diff-panel-resizing");
    };
  }, []);

  const stats = useMemo(
    () =>
      files?.reduce(
        (acc, file) => ({
          added: acc.added + file.additions,
          deleted: acc.deleted + file.deletions,
        }),
        { added: 0, deleted: 0 },
      ) ?? { added: 0, deleted: 0 },
    [files],
  );

  const filePaths = useMemo(() => {
    return files?.map((file) => file.path).filter(Boolean) ?? [];
  }, [files]);

  const fileTree = useMemo(() => buildFileTree(filePaths), [filePaths]);

  const filteredTree = useMemo(() => filterTree(fileTree, search), [fileTree, search]);

  const handleFileClick = useCallback((filePath: string) => {
    setSelectedPath(filePath);
  }, []);

  const handleFileVisible = useCallback((filePath: string) => {
    setSelectedPath(filePath);
  }, []);

  const startTreeResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    treeResizeStateRef.current = { startX: event.clientX, startWidth: fileTreeWidth };
    document.body.classList.add("diff-panel-resizing");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [fileTreeWidth]);

  const isEmpty = files !== null && files.length === 0;
  const hasDiff = !error && files !== null && files.length > 0;

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
          {hasDiff && (
            <button
              className="icon-button"
              onClick={() => setFileSelectorVisible((visible) => !visible)}
              title={fileSelectorVisible ? "Hide file selector" : "Show file selector"}
              type="button"
            >
              {fileSelectorVisible ? (
                <PanelRightClose size={13} />
              ) : (
                <PanelRightOpen size={13} />
              )}
            </button>
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

        {!error && files && !isEmpty && (
          <div className={`diff-panel-split ${fileSelectorVisible ? "" : "diff-panel-split-files-hidden"}`}>
            <div className="diff-panel-frame">
              <div className="diff-panel-content">
                <MonacoDiffViewer
                  className="monaco-diff-viewer"
                  files={files}
                  selectedPath={selectedPath}
                  onFileVisible={handleFileVisible}
                />
              </div>

              {fileSelectorVisible && (
                <>
                  <div
                    className="diff-panel-divider"
                    onPointerDown={startTreeResize}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize file tree"
                  />
                  <aside
                    className="diff-panel-tree"
                    style={{ width: fileTreeWidth }}
                  >
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
                          selectedPath={selectedPath}
                        />
                      ))}
                    </div>
                  </aside>
                </>
              )}
            </div>
          </div>
        )}

        {!error && files === null && status === "loading" && (
          <div className="diff-panel-empty">
            <p className="text-muted-foreground text-xs">Loading diff…</p>
          </div>
        )}
      </div>
    </div>
  );
}
