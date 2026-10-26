import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { refractor } from "refractor";
import tsx from "refractor/tsx";
import { Copy, Pin, X, ScanSearch, MessageSquare, ZoomIn, ZoomOut, Maximize2, Play, Pause } from "lucide-react";
import type { GraphNode, GraphData, IndexStatus } from "../../shared/ipc.js";
import { graphRole } from "./graph-role.js";
import { defaultGraphFilters, nodeTypeMeta, type GraphFilters } from "./graph-view.js";
import { useSigmaGraph, type GraphHighlight } from "../hooks/useSigmaGraph.js";
import "../styles/graph-focus.css";

refractor.register(tsx);
type HighlightNode = ReturnType<typeof refractor.highlight>["children"][number];
function highlightNode(node: HighlightNode, key: string): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return null;
  return <span key={key} className={Array.isArray(node.properties.className) ? node.properties.className.join(" ") : undefined}>{node.children.map((child, index) => highlightNode(child as HighlightNode, `${key}-${index}`))}</span>;
}
function CodePreview({ code, language }: { code: string; language: string }) {
  const content = useMemo(() => {
    if (!refractor.registered(language)) return code;
    try { return refractor.highlight(code, language).children.map((node, index) => highlightNode(node, String(index))); }
    catch { return code; }
  }, [code, language]);
  return <pre tabIndex={0} aria-label="Read-only code preview"><code>{content}</code></pre>;
}
type Preview = { content: string; language: string; lines: number; truncated: boolean };
type PinnedPreview = Preview & { path: string };

export function CodeMapPanel({ active = true, focusedPath, focusRequest = 0, searchQuery = "", filters = defaultGraphFilters, onFiltersChange }: {
  active?: boolean; focusedPath?: string | null; focusRequest?: number; searchQuery?: string;
  filters?: GraphFilters; onFiltersChange?: (filters: GraphFilters) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedPreview[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  // A selected symbol shows its file in the inspector; relations are file-level.
  const selectedSymbol = selectedId?.startsWith("sym:") ? graph?.symbols?.find(symbol => symbol.id === selectedId) : undefined;
  const selectedFileId = selectedSymbol ? selectedSymbol.filePath : selectedId;
  const selected = graph?.nodes.find(node => node.id === selectedFileId);
  const selectedPath = selected?.path;
  const graphNodeMap = useMemo(() => new Map(graph?.nodes.map(node => [node.id, node]) ?? []), [graph]);

  const selectNodeRef = useRef<(id: string, locate?: boolean) => void>(() => {});
  const sigma = useSigmaGraph(id => selectNodeRef.current(id), undefined, () => { setSelectedId(null); setInspectorOpen(false); });
  const { setData, applyHighlight, focusNode } = sigma;

  const refreshGraph = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await window.codemap.getGraphData();
      setGraph(data);
      if (data?.error) setError(data.error);
    } catch (cause) { setError(String(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refreshGraph();
    return window.codemap.onIndexStatus(status => {
      setIndexStatus(status);
      if (status.status === "ready") void refreshGraph();
      if (status.status === "error") setError(status.error ?? "Indexing failed");
    });
  }, [refreshGraph]);

  // Dump the whole graph into Sigma once per data change; layout stays stable afterwards.
  useEffect(() => { setData(graph); }, [graph, setData]);

  const selectNode = useCallback((id: string, locate = false) => {
    // Folder hubs only exist in the rendered graph: highlight their children, no file inspector.
    if (id.startsWith("dir:")) { setSelectedId(id); setInspectorOpen(false); if (locate) focusNode(id); return; }
    const path = id.startsWith("sym:") ? graph?.symbols?.find(symbol => symbol.id === id)?.filePath : graphNodeMap.get(id)?.path;
    if (!path) return;
    setSelectedId(id); setInspectorOpen(true); setActionError(null);
    if (locate) focusNode(id);
    window.dispatchEvent(new Event("codemap-source-open"));
  }, [graph, graphNodeMap, focusNode]);
  selectNodeRef.current = selectNode;

  const consumedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusedPath || !graph) return;
    const request = `${focusedPath}:${focusRequest}`;
    if (consumedFocus.current === request) return;
    const node = graph.nodes.find(node => node.path === focusedPath);
    if (node) { consumedFocus.current = request; selectNode(node.id, true); }
    else setActionError(`File is not indexed: ${focusedPath}`);
  }, [focusedPath, focusRequest, graph, selectNode]);
  useEffect(() => {
    if (selectedPath) window.dispatchEvent(new CustomEvent("codemap-selected-node", { detail: { path: selectedPath } }));
  }, [selectedPath]);
  useEffect(() => {
    const close = () => setInspectorOpen(false);
    window.addEventListener("codemap-close-source", close);
    return () => window.removeEventListener("codemap-close-source", close);
  }, []);
  useEffect(() => {
    if (!active) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setInspectorOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [active]);

  useEffect(() => {
    setPreview(null); setPreviewError(null);
    if (!selectedPath) { setPreviewLoading(false); return; }
    let cancelled = false;
    setPreviewLoading(true);
    void window.codemap.readFilePreview(selectedPath).then(data => {
      if (!cancelled) { setPreview(data); if (!data) setPreviewError("Preview unavailable for this file."); }
    }).catch(cause => { if (!cancelled) setPreviewError(String(cause)); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPath, inspectorOpen]);

  const related = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set<string>();
    for (const edge of graph?.edges ?? []) {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    }
    return ids;
  }, [graph, selectedId]);
  const cycleIds = useMemo(() => new Set(graph?.cycles?.flatMap(cycle => cycle.nodeIds) ?? []), [graph]);
  const searchMatchIds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;
    return new Set([...(graph?.nodes ?? []).filter(node => node.path.toLowerCase().includes(query)).map(node => node.id), ...(graph?.symbols ?? []).filter(symbol => symbol.name.toLowerCase().includes(query)).map(symbol => symbol.id)]);
  }, [graph, searchQuery]);
  // Focus depth: the set of nodes within N hops of the selection (null = show all).
  const depthIds = useMemo(() => {
    if (!filters.depth || !selectedId || !graph || selectedId.startsWith("dir:") || selectedId.startsWith("sym:")) return null;
    const adjacency = new Map<string, string[]>();
    const link = (from: string, to: string) => { const bucket = adjacency.get(from); if (bucket) bucket.push(to); else adjacency.set(from, [to]); };
    for (const edge of graph.edges) { link(edge.source, edge.target); link(edge.target, edge.source); }
    const seen = new Set([selectedId]);
    let frontier = [selectedId];
    for (let hop = 0; hop < filters.depth; hop++) {
      const next: string[] = [];
      for (const id of frontier) for (const neighbor of adjacency.get(id) ?? []) if (!seen.has(neighbor)) { seen.add(neighbor); next.push(neighbor); }
      frontier = next;
    }
    return seen;
  }, [graph, selectedId, filters.depth]);
  const hiddenModules = useMemo(() => new Set(filters.hiddenModules), [filters.hiddenModules]);
  const hiddenKinds = useMemo(() => new Set(filters.hiddenKinds), [filters.hiddenKinds]);
  const hiddenNodeTypes = useMemo(() => new Set(filters.hiddenNodeTypes), [filters.hiddenNodeTypes]);

  // Push selection / search / filters into Sigma reducers — colors/visibility change, positions never do.
  useEffect(() => {
    const highlight: GraphHighlight = { selectedId, relatedIds: related, searchMatchIds, roleFilter: filters.role, cycleIds, hiddenModules, hiddenKinds, hiddenNodeTypes, depthIds, hoveredId: null };
    applyHighlight(highlight);
  }, [selectedId, related, searchMatchIds, filters.role, cycleIds, hiddenModules, hiddenKinds, hiddenNodeTypes, depthIds, applyHighlight]);

  // Focus the first search match so a query jumps the camera to it.
  const lastSearchFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!searchMatchIds || !searchMatchIds.size) { lastSearchFocus.current = null; return; }
    const first = [...searchMatchIds][0];
    if (first && first !== lastSearchFocus.current) { lastSearchFocus.current = first; focusNode(first); }
  }, [searchMatchIds, focusNode]);

  const incoming = graph?.edges.filter(edge => edge.target === selectedFileId).map(edge => graphNodeMap.get(edge.source)).filter((node): node is GraphNode => !!node) ?? [];
  const outgoing = graph?.edges.filter(edge => edge.source === selectedFileId).map(edge => graphNodeMap.get(edge.target)).filter((node): node is GraphNode => !!node) ?? [];

  function askAgent(path: string) {
    setInspectorOpen(false);
    window.dispatchEvent(new CustomEvent("codemap-ask-file", { detail: { path } }));
  }
  const resetView = () => { setSelectedId(null); setInspectorOpen(false); onFiltersChange?.(defaultGraphFilters); sigma.resetView(); };
  const showInspector = inspectorOpen && !!selected;
  const nodeCount = graph?.nodes.length ?? 0;
  const edgeCount = graph?.edges.length ?? 0;
  const symbolCount = graph?.symbols?.length ?? 0;
  return <section className={`focus-graph-panel graph-explorer graph-compact${showInspector ? " inspector-open" : ""}`} aria-label="Code map">
    {showInspector && <aside className="graph-code-inspector" aria-label="Code Inspector">
      <div className="focus-panel-heading"><span>CODE INSPECTOR</span><button className="focus-icon" aria-label="Close code inspector" onClick={() => setInspectorOpen(false)}><X size={14} /></button></div>
      <div className="graph-inspector-scroll">
        <article className="graph-preview-card">
          <header><i style={{ background: graphRole(selected.path).color }} /><strong>{selectedSymbol ? selectedSymbol.name : selected.label}</strong>
            <button aria-label="Locate selected node" title="Locate node" onClick={() => focusNode(selectedId ?? selected.id)}><ScanSearch size={13} /></button>
            <button aria-label="Copy file path" title="Copy path" onClick={() => { void navigator.clipboard.writeText(selected.path).catch(cause => setActionError(String(cause))); }}><Copy size={13} /></button>
            <button aria-label="Pin code preview" title="Pin snapshot" disabled={!preview || pinned.some(item => item.path === selected.path) || pinned.length >= 5} onClick={() => { if (preview) setPinned(current => [...current, { ...preview, path: selected.path }]); }}><Pin size={13} /></button>
          </header>
          <p className="graph-preview-path" title={selected.path}>{selected.path}</p>
          <div className="graph-preview-meta">{selectedSymbol ? `${nodeTypeMeta(selectedSymbol.kind).label}${selectedSymbol.line ? ` · line ${selectedSymbol.line}` : ""} · ${selected.label} · ` : `${graphRole(selected.path).label} · `}{preview?.language ?? selected.language ?? "Source"}{preview ? ` · ${preview.lines}${preview.truncated ? "+" : ""} lines` : ""} · Read only</div>
          {previewLoading ? <p role="status" className="graph-inspector-notice">Loading code…</p>
            : previewError ? <p role="alert" className="graph-inspector-notice">{previewError}</p>
            : preview && <div className="graph-code-snippet"><CodePreview code={preview.content} language={preview.language} /></div>}
          <button className="graph-ask-agent" onClick={() => askAgent(selected.path)}><MessageSquare size={13} />Ask agent about this file</button>
        </article>
        <div className="graph-relations">
          {[{ label: "IMPORTED BY", nodes: incoming }, { label: "IMPORTS", nodes: outgoing }].map(group => <section key={group.label} aria-label={group.label}>
            <h3>{group.label}<span>{group.nodes.length}</span></h3>
            {group.nodes.length ? [...new Map(group.nodes.map(node => [node.id, node])).values()].map(node => <button key={node.id} title={node.path} onClick={() => {
              if (filters.role !== "all" && graphRole(node.path).id !== filters.role) onFiltersChange?.({ ...filters, role: "all" });
              selectNode(node.id, true);
            }}><i style={{ background: graphRole(node.path).color }} /><span>{node.label}<small>{node.path}</small></span></button>) : <p>No relations</p>}
          </section>)}
        </div>
        {!!pinned.length && <div className="graph-pinned-heading">PINNED SNAPSHOTS <span>{pinned.length}/5</span></div>}
        {pinned.map(item => <article className="graph-preview-card graph-pinned-card" key={item.path}>
          <header><Pin size={12} /><strong>{item.path.split("/").at(-1)}</strong><button aria-label={`Unpin ${item.path}`} onClick={() => setPinned(current => current.filter(pin => pin.path !== item.path))}><X size={13} /></button></header>
          <p className="graph-preview-path">{item.path}</p><div className="graph-code-snippet"><CodePreview code={item.content} language={item.language} /></div>
        </article>)}
      </div>
    </aside>}
    <div className="focus-graph-main">
      <header className="focus-graph-toolbar">
        <div><strong>Graph</strong><span className="graph-scope-label">{nodeCount} files · {symbolCount} symbols · {edgeCount} imports</span></div>
        {selected && !showInspector && <button className="secondary-button" onClick={() => { setInspectorOpen(true); window.dispatchEvent(new Event("codemap-source-open")); }}>Inspector</button>}
        <button className="secondary-button" onClick={resetView}>Overview</button>
        <button className="secondary-button" disabled={!sigma.hasGraph} onClick={() => sigma.exportPng()}>Export PNG</button>
      </header>
      {actionError && <p role="alert" className="web-status-banner">{actionError}</p>}
      <div className="codemap-map-container relative flex-1 flex flex-col min-h-0">
        <div className="focus-graph-canvas sigma-canvas" ref={canvasRef}>
          <div className="sigma-holder" ref={sigma.containerRef} />
          <div className="sigma-controls" role="group" aria-label="Graph controls">
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={sigma.zoomIn}><ZoomIn size={15} /></button>
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={sigma.zoomOut}><ZoomOut size={15} /></button>
            <button type="button" aria-label="Fit view" title="Fit view" onClick={sigma.resetView}><Maximize2 size={15} /></button>
            <button type="button" aria-label={sigma.isRunning ? "Pause layout" : "Run layout"} title={sigma.isRunning ? "Pause layout" : "Run layout"} disabled={!sigma.hasGraph} onClick={() => (sigma.isRunning ? sigma.pause() : sigma.play())}>{sigma.isRunning ? <Pause size={15} /> : <Play size={15} />}</button>
          </div>
          {!sigma.hasGraph && (loading || indexStatus?.status === "indexing") ? <div className="codemap-loading" role="status">{indexStatus?.status === "indexing" ? "Indexing workspace…" : "Loading dependency graph…"}</div>
            : error && !sigma.hasGraph ? <div className="codemap-error" role="alert"><span>{error}</span><button className="secondary-button" onClick={() => void refreshGraph()}>Reload</button></div>
            : !loading && !nodeCount ? <div className="codemap-empty"><span>No indexed files</span><button className="secondary-button" onClick={() => void refreshGraph()}>Reload</button></div>
            : null}
          {sigma.hasGraph && error && <div className="graph-layout-status" role="alert">{error}</div>}
        </div>
        <div className="focus-graph-meta" aria-label="Graph summary"><span>{nodeCount} files · {symbolCount} symbols</span><span>{edgeCount} import links</span><span className="focus-graph-meta-hint">Click node to inspect · Scroll to zoom · Drag to pan</span></div>
      </div>
    </div>
  </section>;
}
