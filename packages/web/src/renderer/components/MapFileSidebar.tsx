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
import { moduleKeyOf, edgeKindMeta, nodeTypeMeta, defaultGraphFilters, NODE_TYPE_META, type GraphFilters } from "./graph-view.js";
import type { FileEntry } from "../../shared/ipc.js";


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

export function matchWorkspacePaths(paths: readonly string[], query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return [...new Set(paths)]
    .filter(path => path.toLowerCase().includes(normalized))
    .sort((left, right) => {
      const leftName = left.split("/").at(-1)?.toLowerCase() ?? left;
      const rightName = right.split("/").at(-1)?.toLowerCase() ?? right;
      return Number(rightName.includes(normalized)) - Number(leftName.includes(normalized)) || left.localeCompare(right);
    })
    .slice(0, 100);
}

export function MapFileSidebar({ onSelectFile, selectedPath, searchQuery = "", filters, onFiltersChange }: { filters?: GraphFilters; onFiltersChange?: (filters: GraphFilters) => void; onSelectFile?: (filePath: string) => void; selectedPath?: string | null; searchQuery?: string }) {
  const [tab, setTab] = useState<"explorer" | "filters">("explorer");
  useEffect(() => { if (searchQuery) setTab("explorer"); }, [searchQuery]);
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, FileEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [indexRevision, setIndexRevision] = useState(0);
  const indexedPathsRef = useRef<Promise<string[]> | null>(null);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);
  const [graphMeta, setGraphMeta] = useState<{ modules: { key: string; count: number }[]; kinds: string[]; nodeTypes: { type: string; count: number }[] }>({ modules: [], kinds: [], nodeTypes: [] });

  // Build the module + edge-kind lists for the Filters panel from the dependency graph.
  useEffect(() => {
    if (!filters) return;
    let cancelled = false;
    void window.codemap.getGraphData().then(graph => {
      if (cancelled || !graph || graph.error) return;
      const counts = new Map<string, number>();
      for (const node of graph.nodes) { const key = moduleKeyOf(node.path); counts.set(key, (counts.get(key) ?? 0) + 1); }
      const modules = [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
      // Node types in the rendered graph: folder hubs (every ancestor dir), files, then symbol kinds.
      const folders = new Set<string>(["."]);
      for (const node of graph.nodes) { const parts = node.path.split("/"); for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/")); }
      const typeCounts = new Map<string, number>([["folder", folders.size], ["file", graph.nodes.length]]);
      for (const symbol of graph.symbols ?? []) typeCounts.set(symbol.kind, (typeCounts.get(symbol.kind) ?? 0) + 1);
      const order = Object.keys(NODE_TYPE_META);
      const nodeTypes = [...typeCounts].map(([type, count]) => ({ type, count })).sort((a, b) => (order.indexOf(a.type) + 1 || 99) - (order.indexOf(b.type) + 1 || 99));
      const symbolKinds = new Set((graph.symbolEdges ?? []).map(edge => edge.kind));
      const kinds = ["contains", ...(symbolKinds.has("defines") ? ["defines"] : []), ...new Set(graph.edges.map(edge => edge.importKind)), ...["extends", "implements"].filter(kind => symbolKinds.has(kind as "extends"))];
      setGraphMeta({ modules, kinds, nodeTypes });
    }).catch(() => { /* filters just stay empty */ });
    return () => { cancelled = true; };
  }, [filters, indexRevision]);

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

  useEffect(() => window.codemap.onIndexStatus(status => {
    if (status.status === "ready") {
      indexedPathsRef.current = null;
      setIndexRevision(value => value + 1);
    }
  }), []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearching(false); setSearchError(null); return; }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const timer = window.setTimeout(async () => {
      try {
        indexedPathsRef.current ??= window.codemap.getGraphData().then(graph => {
          if (graph?.error) throw new Error(graph.error);
          return graph?.nodes.map(node => node.path) ?? [];
        });
        const indexedPaths = await indexedPathsRef.current;
        const loadedFiles = [...rootEntries, ...Object.values(expandedDirs).flat()].filter(entry => entry.type !== "directory").map(entry => entry.path);
        if (!cancelled) setSearchResults(matchWorkspacePaths([...indexedPaths, ...loadedFiles], searchQuery));
      } catch (cause) {
        indexedPathsRef.current = null;
        if (!cancelled) setSearchError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 160);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchQuery, rootEntries, expandedDirs, indexRevision]);

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
      {filters && onFiltersChange && <div className="graph-explorer-tabs" role="tablist" aria-label="Explorer views">
        <button role="tab" id="explorer-tab" aria-controls="explorer-panel" aria-selected={tab === "explorer"} tabIndex={tab === "explorer" ? 0 : -1} onClick={() => setTab("explorer")} onKeyDown={event => { if (event.key === "ArrowRight") { setTab("filters"); document.getElementById("filters-tab")?.focus(); } }}>Explorer</button>
        <button role="tab" id="filters-tab" aria-controls="filters-panel" aria-selected={tab === "filters"} tabIndex={tab === "filters" ? 0 : -1} onClick={() => setTab("filters")} onKeyDown={event => { if (event.key === "ArrowLeft") { setTab("explorer"); document.getElementById("explorer-tab")?.focus(); } }}>Filters</button>
      </div>}
      {filters && onFiltersChange && <div id="filters-panel" role="tabpanel" aria-labelledby="filters-tab" className="graph-filter-panel" hidden={tab !== "filters"}>
        <h3>NODE TYPES</h3><p>Toggle visibility of node types in the graph.</p>
        <div className="graph-filter-list">
          {graphMeta.nodeTypes.map(({ type, count }) => {
            const on = !filters.hiddenNodeTypes.includes(type);
            return <button key={type} type="button" className="graph-filter-row" data-on={on} aria-pressed={on} onClick={() => { const hidden = new Set(filters.hiddenNodeTypes); if (hidden.has(type)) hidden.delete(type); else hidden.add(type); onFiltersChange({ ...filters, hiddenNodeTypes: [...hidden] }); }}>
              <i style={{ background: nodeTypeMeta(type).color }} /><span>{nodeTypeMeta(type).label}</span><small>{count}</small>
            </button>;
          })}
        </div>
        <h3>MODULES</h3><p>Toggle folders on or off.</p>
        <div className="graph-filter-list">
          {graphMeta.modules.length ? graphMeta.modules.map(mod => {
            const on = !filters.hiddenModules.includes(mod.key);
            return <button key={mod.key} type="button" className="graph-filter-row" data-on={on} aria-pressed={on} onClick={() => { const hidden = new Set(filters.hiddenModules); if (hidden.has(mod.key)) hidden.delete(mod.key); else hidden.add(mod.key); onFiltersChange({ ...filters, hiddenModules: [...hidden] }); }}>
              <i className="graph-filter-neutral" /><span>{mod.key === "." ? "root" : mod.key}</span><small>{mod.count}</small>
            </button>;
          }) : <p className="graph-filter-empty">No indexed modules</p>}
        </div>
        <h3>EDGE TYPES</h3><p>Toggle relationship kinds.</p>
        <div className="graph-filter-list">
          {graphMeta.kinds.length ? graphMeta.kinds.map(kind => {
            const meta = edgeKindMeta(kind);
            const on = !filters.hiddenKinds.includes(kind);
            return <button key={kind} type="button" className="graph-filter-row" data-on={on} aria-pressed={on} onClick={() => { const hidden = new Set(filters.hiddenKinds); if (hidden.has(kind)) hidden.delete(kind); else hidden.add(kind); onFiltersChange({ ...filters, hiddenKinds: [...hidden] }); }}>
              <i className="graph-filter-edge" style={{ background: meta.color }} /><span>{meta.label}</span>
            </button>;
          }) : <p className="graph-filter-empty">No edges</p>}
        </div>
        <h3>FOCUS DEPTH</h3><p>Show nodes within N hops of the selected node.</p>
        <div className="graph-depth-options" aria-label="Focus depth">{([0, 1, 2, 3] as const).map(depth => <button key={depth} aria-pressed={filters.depth === depth} onClick={() => onFiltersChange({ ...filters, depth })}>{depth ? `${depth} hop${depth > 1 ? "s" : ""}` : "All"}</button>)}</div>
        <h3>COLOR LEGEND</h3>
        <div className="graph-color-legend">{graphMeta.nodeTypes.map(({ type }) => <span key={type}><i style={{ background: nodeTypeMeta(type).color }} />{nodeTypeMeta(type).label}</span>)}</div>
        <button className="secondary-button" onClick={() => onFiltersChange(defaultGraphFilters)}>Reset filters</button>
      </div>}
      <div id="explorer-panel" role={filters ? "tabpanel" : undefined} aria-labelledby={filters ? "explorer-tab" : undefined} hidden={tab !== "explorer"} className="graph-explorer-tree">
      <div className="map-file-sidebar-header">
        <span className="map-file-sidebar-title">Files</span>
        <button
          className="map-file-sidebar-refresh"
          onClick={() => {
            indexedPathsRef.current = null;
            setIndexRevision(value => value + 1);
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
        {searchQuery.trim() ? (
          searching ? <div className="map-file-tree-empty" role="status">Searching workspace…</div>
            : searchError ? <div className="map-file-tree-empty" role="alert">{searchError}</div>
            : searchResults.length ? searchResults.map(path => <button key={path}
                className={`map-file-tree-row map-file-tree-file${path === selectedPath ? " map-file-tree-row--active" : ""}`}
                style={{ paddingLeft: 12 }} title={path} onClick={() => onSelectFile?.(path)}>
                {renderFileIcon(path.split("/").at(-1) ?? path)}
                <span className="focus-file-search-result"><span>{path.split("/").at(-1)}</span><small>{path}</small></span>
              </button>)
            : <div className="map-file-tree-empty">No files match</div>
        ) : loading
          ? <div className="map-file-tree-empty">Loading...</div>
          : rootEntries.length === 0
            ? <div className="map-file-tree-empty">No files found</div>
            : (() => {
              const result = rootEntries.map(entry => renderEntry(entry, 0)).filter(Boolean);
              return result.length > 0 ? result : <div className="map-file-tree-empty">No files match</div>;
            })()}
      </div>
      </div>
    </div>
  );
}
