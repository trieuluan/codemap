import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Braces,
  Code2,
  Coffee,
  Database,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  Image,
  Package,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Settings,
  Terminal,
} from "lucide-react";
import type { FileEntry } from "../../shared/ipc.js";

// ponytail: file-tree sidebar for map route. Add file filtering/search here when needed.

function fileIconClass(filename: string): string {
  const lower = filename.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";

  if (lower === "package.json" || lower === "package-lock.json" || lower === "pnpm-lock.yaml") return "package";
  if (lower === "tsconfig.json" || lower.startsWith("tsconfig.")) return "config";
  if (lower === ".gitignore" || lower === ".gitattributes" || lower === ".gitmodules") return "shell";
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "shell";

  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "javascript";
  if (ext === "json" || ext === "jsonc") return "json";
  if (ext === "css" || ext === "scss" || ext === "sass" || ext === "less") return "style";
  if (ext === "md" || ext === "mdx" || ext === "txt") return "text";
  if (ext === "sql" || ext === "prisma") return "database";
  if (ext === "java" || ext === "kt" || ext === "kts") return "jvm";
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "svg" || ext === "webp" || ext === "ico") return "image";
  if (ext === "sh" || ext === "bash" || ext === "zsh" || ext === "fish" || ext === "ps1") return "shell";

  return "code";
}

function renderFileIcon(filename: string) {
  const iconClass = fileIconClass(filename);
  const className = `map-file-tree-icon map-file-tree-icon--${iconClass}`;

  switch (iconClass) {
    case "package":
      return <Package size={14} className={className} />;
    case "config":
      return <Settings size={14} className={className} />;
    case "typescript":
      return <Code2 size={14} className={className} />;
    case "javascript":
    case "code":
      return <FileCode size={14} className={className} />;
    case "json":
      return <FileJson size={14} className={className} />;
    case "style":
      return <Braces size={14} className={className} />;
    case "text":
      return <FileText size={14} className={className} />;
    case "database":
      return <Database size={14} className={className} />;
    case "jvm":
      return <Coffee size={14} className={className} />;
    case "image":
      return <Image size={14} className={className} />;
    case "shell":
      return <Terminal size={14} className={className} />;
    default:
      return <FileCode size={14} className={className} />;
  }
}

export function MapFileSidebar({ onSelectFile, selectedPath, searchQuery = "" }: { onSelectFile?: (filePath: string) => void; selectedPath?: string | null; searchQuery?: string }) {
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, FileEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  // Client-side filter tree by searchQuery
  const loadDir = useCallback(async (dirPath: string) => {
    const entries = await window.codemap.readDirectory(dirPath);
    return entries;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setRootEntries(await loadDir(""));
      setLoading(false);
    })();
  }, [loadDir]);

  // Auto-expand parent dirs + scroll to active file when selectedPath changes
  useEffect(() => {
    if (!selectedPath) return;
    const expandParents = async () => {
      const parts = selectedPath.split("/");
      let current = "";
      const toExpand: string[] = [];
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        if (!(current in expandedDirs)) {
          toExpand.push(current);
        }
      }
      if (toExpand.length === 0) {
        activeRowRef.current?.scrollIntoView({ block: "nearest" });
        return;
      }
      // Expand all parent dirs sequentially
      for (const dir of toExpand) {
        if (dir in expandedDirs) continue;
        const entries = await loadDir(dir);
        setExpandedDirs((prev) => ({ ...prev, [dir]: entries }));
      }
      // Scroll after next render
      requestAnimationFrame(() => activeRowRef.current?.scrollIntoView({ block: "nearest" }));
    };
    void expandParents();
  }, [selectedPath, loadDir]);

  const toggleDir = useCallback(async (dirPath: string) => {
    if (expandedDirs[dirPath]) {
      setExpandedDirs(prev => {
        const next = { ...prev };
        delete next[dirPath];
        return next;
      });
    } else {
      setExpandedDirs(prev => ({ ...prev, [dirPath]: [] }));
      const entries = await loadDir(dirPath);
      setExpandedDirs(prev => ({ ...prev, [dirPath]: entries }));
    }
  }, [expandedDirs, loadDir]);

  const renderEntry = (entry: FileEntry, depth: number): React.ReactNode | null => {
    const isExpanded = entry.path in expandedDirs;
    const indent = depth * 12;
    const q = searchQuery.trim().toLowerCase();

    if (entry.type === "directory") {
      const children = expandedDirs[entry.path];
      const filteredChildren = children ? children.map(c => renderEntry(c, depth + 1)).filter(Boolean) : null;

      // If query active: show dir only if any child matches or dir name itself matches
      if (q && !entry.name.toLowerCase().includes(q) && (!filteredChildren || filteredChildren.length === 0)) return null;

      return (
        <div key={entry.path}>
          <button
            className="map-file-tree-row"
            style={{ paddingLeft: 8 + indent }}
            onClick={() => toggleDir(entry.path)}
            title={entry.path}
          >
            <span className="map-file-tree-chevron">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            {isExpanded
              ? <FolderOpen size={14} className="map-file-tree-icon map-file-tree-icon--folder" />
              : <Folder size={14} className="map-file-tree-icon map-file-tree-icon--folder" />}
            <span className="map-file-tree-name">{entry.name}</span>
          </button>
          {isExpanded && filteredChildren && filteredChildren.length > 0 && filteredChildren}
        </div>
      );
    }

    if (q && !entry.name.toLowerCase().includes(q) && !entry.path.toLowerCase().includes(q)) return null;

    return (
      <button
        key={entry.path}
        ref={entry.path === selectedPath ? activeRowRef : undefined}
        className={`map-file-tree-row map-file-tree-file${entry.path === selectedPath ? " map-file-tree-row--active" : ""}`}
        style={{ paddingLeft: 20 + indent }}
        title={entry.path}
        onClick={() => onSelectFile?.(entry.path)}
      >
        {renderFileIcon(entry.name)}
        <span className="map-file-tree-name">{entry.name}</span>
      </button>
    );
  };

  return (
    <div className="map-file-sidebar">
      <div className="map-file-sidebar-header">
        <span className="map-file-sidebar-title">Files</span>
        <button
          className="map-file-sidebar-refresh"
          onClick={() => {
            setExpandedDirs({});
            loadDir("").then(entries => {
              setRootEntries(entries);
              setLoading(false);
            });
            setLoading(true);
          }}
          title="Refresh file tree"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="map-file-sidebar-body">
        {loading
          ? <div className="map-file-tree-empty">Loading...</div>
          : rootEntries.length === 0
            ? <div className="map-file-tree-empty">No files found</div>
            : (() => {
              const result = rootEntries.map(entry => renderEntry(entry, 0)).filter(Boolean);
              return result.length > 0 ? result : <div className="map-file-tree-empty">No files match</div>;
            })()}
      </div>
    </div>
  );
}
