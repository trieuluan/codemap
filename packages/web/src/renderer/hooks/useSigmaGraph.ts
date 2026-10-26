import { useCallback, useEffect, useRef, useState } from "react";
import Sigma from "sigma";
import { DirectedGraph } from "graphology";
import EdgeCurveProgram from "@sigma/edge-curve";
import type { EdgeProgramType } from "sigma/rendering";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import forceAtlas2Default from "graphology-layout-forceatlas2";
import { graphRole } from "../components/graph-role.js";
import { moduleKeyOf, edgeKindMeta, nodeTypeMeta, layoutDurationMs, layoutSlowDown } from "../components/graph-view.js";
import type { GraphData } from "../../shared/ipc.js";

type NodeAttrs = { x: number; y: number; size: number; color: string; baseColor: string; label: string; path: string; moduleKey: string; nodeType: string };
type EdgeAttrs = { size: number; baseColor: string; kind: string };
type SceneGraph = DirectedGraph<NodeAttrs, EdgeAttrs>;

// graphology-layout-forceatlas2 ships CJS with ESM-style typings, so under NodeNext the default
// import types as the module namespace. Grab the real callable off `.default` when present.
type FA2Lib = { assign(graph: SceneGraph, params: { iterations: number; settings?: Record<string, unknown> }): void; inferSettings(graph: SceneGraph): Record<string, unknown> };
const forceAtlas2 = ((forceAtlas2Default as unknown as { default?: FA2Lib }).default ?? (forceAtlas2Default as unknown as FA2Lib));

// Strong gravity keeps the layout bounded; LinLog spreads nodes evenly instead of packing hubs into
// dense blobs. Measured on 1.5k nodes: overlapping nodes 15% -> 3%, and the layout grows only ~6%
// after the pre-layout, so the frozen frame still fits. slowDown is only the starting value; the
// live run ramps it up (see layoutSlowDown).
function fa2Settings(graph: SceneGraph): Record<string, unknown> {
  return { ...forceAtlas2.inferSettings(graph), barnesHutOptimize: graph.order > 200, strongGravityMode: true, gravity: 0.05, scalingRatio: 10, slowDown: 1, linLogMode: true, outboundAttractionDistribution: true, adjustSizes: true };
}

// Current highlight/filter state. Lives in a ref so reducers read it without
// re-instantiating Sigma — we just mutate it and call sigma.refresh().
export type GraphHighlight = {
  selectedId: string | null;
  relatedIds: Set<string>;
  searchMatchIds: Set<string> | null;
  roleFilter: string;
  cycleIds: Set<string>;
  hiddenModules: Set<string>;
  hiddenKinds: Set<string>;
  hiddenNodeTypes: Set<string>;
  depthIds: Set<string> | null;
  hoveredId: string | null;
};

const EDGE_BASE = "#3a4457";
const EDGE_FOCUS = "#7dc8de";
const CYCLE_COLOR = "#e0795b";
const LABELED_FILES = 14;
const PRELAYOUT_BUDGET_MS = 400;
const emptyHighlight = (): GraphHighlight => ({ selectedId: null, relatedIds: new Set(), searchMatchIds: null, roleFilter: "all", cycleIds: new Set(), hiddenModules: new Set(), hiddenKinds: new Set(), hiddenNodeTypes: new Set(), depthIds: null, hoveredId: null });

// Sigma's WebGL programs blend as premultiplied alpha but never premultiply the colour, so a low
// alpha still renders at full brightness. Fade by mixing toward the canvas background instead.
const CANVAS_BG = [17, 19, 24];
function mixWithBg(hex: string, amount: number) {
  const channel = (offset: number, index: number) => Math.round(CANVAS_BG[index] + (parseInt(hex.slice(offset, offset + 2), 16) - CANVAS_BG[index]) * amount);
  return `#${[channel(1, 0), channel(3, 1), channel(5, 2)].map(value => value.toString(16).padStart(2, "0")).join("")}`;
}

// Seed each node near a per-directory anchor so same-folder files start clustered;
// ForceAtlas2 then refines by import edges. A good seed means the sim converges fast.
function seedPosition(path: string, index: number) {
  const key = path.split("/").slice(0, -1).join("/") || ".";
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const angle = (hash % 360) * (Math.PI / 180);
  const ring = 300 + (hash % 500);
  const jitter = ((index * 2654435761) >>> 0) % 140;
  return { x: Math.cos(angle) * ring + (jitter - 70), y: Math.sin(angle) * ring + ((jitter * 7) % 140 - 70) };
}

const parentDir = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".");

// Files plus a hub node per folder linked by "contains" edges (like GitNexus). Without the hubs
// ~45% of files have no edges at all and get flung to the edges of the frame.
function buildGraph(data: GraphData): SceneGraph {
  const graph: SceneGraph = new DirectedGraph<NodeAttrs, EdgeAttrs>({ multi: false, allowSelfLoops: false });
  const degree = new Map<string, number>();
  for (const node of data.nodes) degree.set(node.id, (node.inboundCount ?? 0) + (node.outboundCount ?? 0));
  data.nodes.forEach((node, index) => {
    const color = nodeTypeMeta("file").color;
    const size = Math.max(2.5, Math.min(7, 2.5 + Math.sqrt(degree.get(node.id) ?? 0) * 0.8));
    graph.addNode(node.id, { ...seedPosition(node.path, index), size, color, baseColor: color, label: node.label, path: node.path, moduleKey: moduleKeyOf(node.path), nodeType: "file" });
  });
  // Edges stay faint (GitNexus-style): the LinLog layout spreads nodes evenly, so lines are long and
  // would otherwise mesh over the whole cloud. A selected node's edges still light up.
  const containsColor = mixWithBg(edgeKindMeta("contains").color, 0.3);
  const folder = (dir: string): string => {
    const id = `dir:${dir}`;
    if (!graph.hasNode(id)) {
      graph.addNode(id, { ...seedPosition(`${dir}/x`, graph.order), size: 7, color: nodeTypeMeta("folder").color, baseColor: nodeTypeMeta("folder").color, label: dir === "." ? "root" : dir.split("/").at(-1)!, path: dir, moduleKey: moduleKeyOf(`${dir}/x`), nodeType: "folder" });
      if (dir !== ".") graph.mergeDirectedEdge(folder(parentDir(dir)), id, { size: 0.6, baseColor: containsColor, kind: "contains" });
    }
    return id;
  };
  for (const node of data.nodes) graph.mergeDirectedEdge(folder(parentDir(node.path)), node.id, { size: 0.6, baseColor: containsColor, kind: "contains" });
  graph.forEachNode((id, attrs) => { if (attrs.nodeType === "folder") graph.setNodeAttribute(id, "size", Math.min(8, 3.5 + Math.sqrt(graph.outDegree(id)) * 0.6)); });
  for (const edge of data.edges) {
    if (edge.source === edge.target || !graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
    graph.mergeDirectedEdge(edge.source, edge.target, { size: 0.9, baseColor: mixWithBg(edgeKindMeta(edge.importKind).color, 0.55), kind: edge.importKind });
  }
  // Symbol layer: small dots that start right next to their file and orbit it once laid out.
  // Seed symbols evenly on a ring around their file: stacking them on one spot leaves ~170
  // overlapping pairs after layout, a ring leaves ~1.
  const perFile = new Map<string, number>();
  for (const symbol of data.symbols ?? []) perFile.set(symbol.filePath, (perFile.get(symbol.filePath) ?? 0) + 1);
  const placed = new Map<string, number>();
  for (const symbol of data.symbols ?? []) {
    if (graph.hasNode(symbol.id) || !graph.hasNode(symbol.filePath)) continue;
    const file = graph.getNodeAttributes(symbol.filePath);
    const count = perFile.get(symbol.filePath) ?? 1, slot = placed.get(symbol.filePath) ?? 0;
    placed.set(symbol.filePath, slot + 1);
    const angle = (slot / count) * Math.PI * 2, radius = 20 + Math.sqrt(count) * 6;
    const color = nodeTypeMeta(symbol.kind).color;
    graph.addNode(symbol.id, { x: file.x + Math.cos(angle) * radius, y: file.y + Math.sin(angle) * radius, size: symbol.kind === "class" || symbol.kind === "interface" ? 2 : 1.3, color, baseColor: color, label: symbol.name, path: symbol.filePath, moduleKey: moduleKeyOf(symbol.filePath), nodeType: symbol.kind });
  }
  for (const edge of data.symbolEdges ?? []) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target) || edge.source === edge.target) continue;
    const structural = edge.kind === "defines";
    graph.mergeDirectedEdge(edge.source, edge.target, { size: structural ? 0.5 : 1.2, baseColor: mixWithBg(edgeKindMeta(edge.kind).color, structural ? 0.22 : 0.9), kind: edge.kind });
  }
  return graph;
}

export interface UseSigmaGraphReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  setData: (data: GraphData | null) => void;
  applyHighlight: (next: GraphHighlight) => void;
  focusNode: (id: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  play: () => void;
  pause: () => void;
  exportPng: () => void;
  isRunning: boolean;
  hasGraph: boolean;
}

export function useSigmaGraph(onSelectNode?: (id: string) => void, onHoverNode?: (id: string | null) => void, onClickStage?: () => void): UseSigmaGraphReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null);
  const graphRef = useRef<SceneGraph | null>(null);
  const layoutRef = useRef<FA2Layout | null>(null);
  const coolingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const labelIdsRef = useRef<Set<string>>(new Set());
  const highlightRef = useRef<GraphHighlight>(emptyHighlight());
  const onSelectRef = useRef(onSelectNode);
  const onHoverRef = useRef(onHoverNode);
  const onStageRef = useRef(onClickStage);
  onSelectRef.current = onSelectNode;
  onHoverRef.current = onHoverNode;
  onStageRef.current = onClickStage;
  const [isRunning, setIsRunning] = useState(false);
  const [hasGraph, setHasGraph] = useState(false);

  const stopLayout = useCallback(() => {
    if (coolingRef.current) { clearInterval(coolingRef.current); coolingRef.current = null; }
    if (layoutRef.current?.isRunning()) layoutRef.current.stop();
    setIsRunning(false);
  }, []);

  // Run ForceAtlas2 in the worker for a fixed time while ramping its damping, so nodes flow, settle
  // and stop instead of jittering forever. Play starts a fresh cooling run from the current layout.
  const startLayout = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || graph.order < 2) return;
    if (!layoutRef.current) layoutRef.current = new FA2Layout(graph, { settings: fa2Settings(graph) });
    const layout = layoutRef.current, duration = layoutDurationMs(graph.order), started = performance.now();
    if (coolingRef.current) clearInterval(coolingRef.current);
    layout.settings.slowDown = layoutSlowDown(0, duration);
    coolingRef.current = setInterval(() => {
      const elapsed = performance.now() - started;
      if (elapsed >= duration) { stopLayout(); return; }
      layout.settings.slowDown = layoutSlowDown(elapsed, duration);
    }, 100);
    layout.start();
    setIsRunning(true);
  }, [stopLayout]);

  // Reducers read the live highlight ref so we never rebuild Sigma on selection change.
  const nodeReducer = useCallback((node: string, data: NodeAttrs) => {
    const h = highlightRef.current;
    const res: Partial<NodeAttrs> & { hidden?: boolean; highlighted?: boolean; forceLabel?: boolean; zIndex?: number } = { ...data };
    const isFolder = data.nodeType === "folder";
    if (h.hiddenNodeTypes.has(data.nodeType) || (isFolder && h.hiddenKinds.has("contains"))) { res.hidden = true; return res; }
    if (!isFolder && h.roleFilter !== "all" && graphRole(data.path).id !== h.roleFilter) { res.hidden = true; return res; }
    if (h.hiddenModules.has(data.moduleKey)) { res.hidden = true; return res; }
    if (h.depthIds && !h.depthIds.has(node)) { res.hidden = true; return res; }
    const isSelected = node === h.selectedId;
    const isRelated = h.relatedIds.has(node);
    const matchesSearch = !h.searchMatchIds || h.searchMatchIds.has(node);
    const faded = (h.selectedId != null && !isSelected && !isRelated) || !matchesSearch;
    if (h.cycleIds.has(node)) res.color = CYCLE_COLOR;
    if (faded) { res.color = mixWithBg(data.baseColor, 0.12); res.label = ""; return res; }
    if (isSelected) { res.highlighted = true; res.forceLabel = true; res.zIndex = 2; res.size = data.size * 1.6; }
    else if (isRelated || node === h.hoveredId || h.searchMatchIds?.has(node)) { res.forceLabel = true; res.zIndex = 1; }
    else if (labelIdsRef.current.has(node)) res.forceLabel = true;
    return res;
  }, []);

  const edgeReducer = useCallback((edge: string, data: EdgeAttrs) => {
    const graph = graphRef.current;
    const h = highlightRef.current;
    const res: Partial<EdgeAttrs> & { hidden?: boolean; color?: string; zIndex?: number } = { ...data, color: data.baseColor };
    if (!graph) return res;
    if (h.hiddenKinds.has(data.kind)) { res.hidden = true; return res; }
    const source = graph.source(edge), target = graph.target(edge);
    const src = graph.getNodeAttributes(source), tgt = graph.getNodeAttributes(target);
    if (h.hiddenNodeTypes.has(src.nodeType) || h.hiddenNodeTypes.has(tgt.nodeType)) { res.hidden = true; return res; }
    if (h.roleFilter !== "all" && ((src.nodeType !== "folder" && graphRole(src.path).id !== h.roleFilter) || (tgt.nodeType !== "folder" && graphRole(tgt.path).id !== h.roleFilter))) { res.hidden = true; return res; }
    if (h.hiddenModules.has(src.moduleKey) || h.hiddenModules.has(tgt.moduleKey)) { res.hidden = true; return res; }
    if (h.depthIds && (!h.depthIds.has(source) || !h.depthIds.has(target))) { res.hidden = true; return res; }
    const touchesSelected = h.selectedId != null && (source === h.selectedId || target === h.selectedId);
    if (touchesSelected) { res.color = EDGE_FOCUS; res.size = 2; res.zIndex = 1; }
    else if (h.selectedId != null) res.color = mixWithBg(EDGE_BASE, 0.3);
    return res;
  }, []);

  const setData = useCallback((data: GraphData | null) => {
    if (coolingRef.current) { clearInterval(coolingRef.current); coolingRef.current = null; }
    layoutRef.current?.kill();
    layoutRef.current = null;
    sigmaRef.current?.kill();
    sigmaRef.current = null;
    graphRef.current = null;
    if (!data || !data.nodes.length || !containerRef.current) { setHasGraph(false); setIsRunning(false); return; }
    const graph = buildGraph(data);
    graphRef.current = graph;
    // Converge up front within a fixed time budget so the graph opens already laid out (cost grows
    // with node count: ~0.4ms/iteration at 300 nodes, ~3.5ms at 1.5k). Measured offline: ~100
    // iterations already fix the frame — the live worker then grows it by ~10% at most.
    try {
      const settings = fa2Settings(graph), started = performance.now();
      for (let done = 0; done < 500 && (done < 60 || performance.now() - started < PRELAYOUT_BUDGET_MS); done += 20) forceAtlas2.assign(graph, { iterations: 20, settings });
    } catch { /* keep seeded positions */ }
    // Stable labels: folder hubs with a few children plus the most connected files. Letting Sigma pick labels per
    // frame makes them flicker while nodes move.
    const files = graph.filterNodes((_, attrs) => attrs.nodeType === "file").sort((a, b) => graph.degree(b) - graph.degree(a));
    labelIdsRef.current = new Set([...graph.filterNodes((id, attrs) => attrs.nodeType === "folder" && graph.outDegree(id) >= 3), ...files.slice(0, LABELED_FILES)]);
    const sigma = new Sigma<NodeAttrs, EdgeAttrs>(graph, containerRef.current, {
      allowInvalidContainer: true,
      renderLabels: true,
      labelColor: { color: "#c3ccda" },
      labelFont: "ui-sans-serif, system-ui, sans-serif",
      labelSize: 11,
      labelRenderedSizeThreshold: 14,
      defaultEdgeType: "curve",
      edgeProgramClasses: { curve: EdgeCurveProgram as unknown as EdgeProgramType<NodeAttrs, EdgeAttrs> },
      defaultEdgeColor: EDGE_BASE,
      minCameraRatio: 0.05,
      maxCameraRatio: 12,
      nodeReducer,
      edgeReducer,
    });
    // Freeze the frame to the converged layout (+ padding). By default Sigma re-fits to the node
    // extent on every render, so moving nodes would make the whole graph zoom/wobble each frame.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    graph.forEachNode((_, attrs) => { minX = Math.min(minX, attrs.x); maxX = Math.max(maxX, attrs.x); minY = Math.min(minY, attrs.y); maxY = Math.max(maxY, attrs.y); });
    const padX = (maxX - minX) * 0.12 || 1, padY = (maxY - minY) * 0.12 || 1;
    sigma.setCustomBBox({ x: [minX - padX, maxX + padX], y: [minY - padY, maxY + padY] });
    sigma.on("clickNode", ({ node }) => onSelectRef.current?.(node));
    sigma.on("clickStage", () => onStageRef.current?.());
    sigma.on("enterNode", ({ node }) => { highlightRef.current.hoveredId = node; onHoverRef.current?.(node); sigma.refresh({ skipIndexation: true }); });
    sigma.on("leaveNode", () => { highlightRef.current.hoveredId = null; onHoverRef.current?.(null); sigma.refresh({ skipIndexation: true }); });
    sigmaRef.current = sigma;
    setHasGraph(true);
    startLayout();
  }, [nodeReducer, edgeReducer, startLayout]);

  const applyHighlight = useCallback((next: GraphHighlight) => {
    // Neighbours come from the rendered graph so folder hubs (contains edges) highlight too.
    const graph = graphRef.current;
    const relatedIds = next.selectedId && graph?.hasNode(next.selectedId) ? new Set([...next.relatedIds, ...graph.neighbors(next.selectedId)]) : next.relatedIds;
    highlightRef.current = { ...next, relatedIds, hoveredId: highlightRef.current.hoveredId };
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, []);

  const focusNode = useCallback((id: string) => {
    const sigma = sigmaRef.current;
    if (!sigma || !graphRef.current?.hasNode(id)) return;
    const position = sigma.getNodeDisplayData(id);
    if (position) void sigma.getCamera().animate({ x: position.x, y: position.y, ratio: 0.35 }, { duration: 420 });
  }, []);

  const zoomIn = useCallback(() => { void sigmaRef.current?.getCamera().animatedZoom({ duration: 200 }); }, []);
  const zoomOut = useCallback(() => { void sigmaRef.current?.getCamera().animatedUnzoom({ duration: 200 }); }, []);
  const resetView = useCallback(() => { void sigmaRef.current?.getCamera().animatedReset({ duration: 300 }); }, []);
  const play = useCallback(() => startLayout(), [startLayout]);
  const pause = useCallback(() => stopLayout(), [stopLayout]);

  const exportPng = useCallback(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    const { width, height } = sigma.getDimensions();
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, width, height);
    for (const layer of Object.values(sigma.getCanvases())) ctx.drawImage(layer, 0, 0, width, height);
    const anchor = document.createElement("a");
    anchor.download = "codemap.png";
    anchor.href = canvas.toDataURL("image/png");
    anchor.click();
  }, []);

  useEffect(() => () => {
    if (coolingRef.current) clearInterval(coolingRef.current);
    layoutRef.current?.kill();
    sigmaRef.current?.kill();
  }, []);

  return { containerRef, setData, applyHighlight, focusNode, zoomIn, zoomOut, resetView, play, pause, exportPng, isRunning, hasGraph };
}
