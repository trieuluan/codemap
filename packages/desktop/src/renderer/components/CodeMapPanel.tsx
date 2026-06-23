import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  applyNodeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ElkConstructor from "elkjs/lib/elk.bundled.js";
import type { GraphNode, GraphData } from "../../shared/ipc.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const elk = new (ElkConstructor as any)();

const NODE_W = 240;
const NODE_H = 72;
const FOLDER_W = 260;
const FOLDER_H = 96;
const CLUSTER_THRESHOLD = 8;

type GraphMode = "overview" | "structure" | "focus";

interface NavState {
  mode: GraphMode;
  folder?: { id: string; path: string };
  focusNodeId?: string;
}

// Accent strip colors by language — fallback to border var
const LANG_ACCENT: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f7df1e",
  jsx: "#f7df1e",
  dart: "#0175c2",
  python: "#3572a5",
  go: "#00add8",
  rust: "#dea584",
  php: "#777bb4",
};

function accentColor(language?: string) {
  return LANG_ACCENT[language ?? ""] ?? "var(--border-strong)";
}

async function elkLayout(
  nodes: { id: string }[],
  edges: { id: string; source: string; target: string }[],
  dims: { w: number; h: number } = { w: NODE_W, h: NODE_H },
): Promise<Map<string, { x: number; y: number }>> {
  if (nodes.length === 0) return new Map();

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
      "elk.spacing.nodeNode": "24",
      "elk.spacing.componentComponent": "24",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      "elk.layered.thoroughness": "5",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: dims.w,
      height: dims.h,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const result = await elk.layout(elkGraph);
  return new Map(
    (result.children ?? []).map((c: { id: string; x?: number; y?: number }) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
  );
}

function relatedNodeIds(selectedId: string, edges: { source: string; target: string }[]) {
  const related = new Set([selectedId]);
  for (const { source, target } of edges) {
    if (source === selectedId) related.add(target);
    if (target === selectedId) related.add(source);
  }
  return related;
}

function FolderNode({ data }: { data: { label: string; fileCount?: number; inboundCount?: number; outgoingCount?: number } }) {
  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/40 !rounded-full" />
      <div className="codemap-folder-node">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="codemap-folder-node-icon">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <div className="codemap-folder-node-body">
          <strong className="codemap-folder-node-label">{data?.label ?? "?"}</strong>
          <span className="codemap-folder-node-files">{data?.fileCount ?? 0} files</span>
          <div className="codemap-folder-node-stats">
            <span className="stat-in" title="Incoming">↓{data?.inboundCount ?? 0}</span>
            <span className="stat-out" title="Outgoing">↑{data?.outgoingCount ?? 0}</span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/40 !rounded-full" />
    </>
  );
}

function DependencyNode({ data, selected }: { data: GraphNode; selected: boolean }) {
  const label = data?.label ?? data?.path?.split("/").pop() ?? "?";
  const dirPath = data?.dirPath ?? "";
  const isInCycle = data?.isInCycle ?? false;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/50 !rounded-full" />
      <div
        className={`codemap-dependency-node${selected ? " selected" : ""}${isInCycle ? " in-cycle" : ""}`}
      >
        <div
          className="codemap-dependency-node-accent"
          style={{ background: accentColor(data?.language) }}
        />
        <div className="codemap-dependency-node-body">
          <div className="codemap-dependency-node-header">
            <strong className="codemap-dependency-node-label">{label}</strong>
            {isInCycle && (
              <span className="codemap-dependency-node-cycle">Cycle</span>
            )}
          </div>
          {dirPath && (
            <span className="codemap-dependency-node-path">{dirPath}</span>
          )}
          <div className="codemap-dependency-node-stats">
            <span className="stat-in" title="Incoming">↓{data?.inboundCount ?? 0}</span>
            <span className="stat-out" title="Outgoing">↑{data?.outboundCount ?? 0}</span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/50 !rounded-full" />
    </>
  );
}

interface ClusterNodeData {
  kind: "cluster";
  direction: "incoming" | "outgoing";
  focusId: string;
  nodeIds: string[];
  count: number;
  sample: string[];
}

function ClusterNode({ data }: { data: ClusterNodeData }) {
  const isIncoming = data?.direction === "incoming";
  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/50 !rounded-full" />
      <div className={`codemap-cluster-node ${isIncoming ? "direction-in" : "direction-out"}`}>
        <div className="codemap-cluster-node-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="codemap-cluster-icon">
            {isIncoming ? (
              <><path d="M12 5v14" /><path d="M5 12l7 7 7-7" /></>
            ) : (
              <><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></>
            )}
          </svg>
          <strong className="codemap-cluster-label">
            +{data?.count ?? 0} {isIncoming ? "imported by" : "imports"}
          </strong>
        </div>
        <div className="codemap-cluster-sample">
          {(data?.sample ?? []).map((s, i) => (
            <span key={i} className="codemap-cluster-sample-file">{s}</span>
          ))}
          {(data?.count ?? 0) > 3 && (
            <span className="codemap-cluster-more">+{data.count - 3} more</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/50 !rounded-full" />
    </>
  );
}

export function CodeMapPanel() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutMap, setLayoutMap] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [navStack, setNavStack] = useState<NavState[]>([{ mode: "overview" }]);
  const currentNav = navStack[navStack.length - 1];
  const pushNav = (s: NavState) => setNavStack((prev) => [...prev, s]);
  const popNav = () => setNavStack((prev) => prev.slice(0, -1));

  const folderNodes = graphData?.folderNodes;
  const useFolderGraph = folderNodes && folderNodes.length > 0;

  // Mode-based data filtering (memoized to avoid re-layout on drag)
  const { displayNodes, displayEdges, displayUseFolder } = useMemo(() => {
    let useFolder = useFolderGraph;
    let nodes = useFolder
      ? (graphData?.folderNodes ?? []).map((f) => ({
          id: f.id, label: f.folder, path: f.folder,
          inboundCount: f.incomingCount, outboundCount: f.outgoingCount,
          category: "other" as const, fileCount: f.fileCount,
        }))
      : (graphData?.nodes ?? []).map((n) => ({ ...n, fileCount: undefined as number | undefined }));
    let edges = useFolder
      ? (graphData?.folderEdges ?? []).map((e) => ({
          id: e.id, source: e.source, target: e.target,
          importKind: "import" as const, isResolved: true, edgeCount: e.edgeCount,
        }))
      : (graphData?.edges ?? []).map((e) => ({
          id: e.id, source: e.source, target: e.target,
          importKind: e.importKind, isResolved: e.isResolved, edgeCount: undefined as number | undefined,
        }));

    if (currentNav.mode === "structure" && currentNav.folder && graphData) {
      // Structure: files + immediate sub-folders under selected folder
      const prefix = currentNav.folder.path + "/";
      const allFiles = (graphData.nodes ?? []).filter((n) => n.path.startsWith(prefix));
      const fileMap = new Map(allFiles.map((n) => [n.id, n]));

      // Group files by immediate sub-folder
      const directFiles: any[] = [];
      const subFolders = new Map<string, { id: string; label: string; path: string; fileCount: number; inboundCount: number; outboundCount: number; category: "other"; memberIds: string[] }>();
      for (const f of allFiles) {
        const rel = f.path.slice(prefix.length);
        const slashIdx = rel.indexOf("/");
        if (slashIdx === -1) {
          // File directly in this folder
          directFiles.push({ ...f, fileCount: undefined as number | undefined });
        } else {
          // File in a sub-folder
          const subPath = prefix + rel.slice(0, slashIdx);
          let sf = subFolders.get(subPath);
          if (!sf) {
            const subLabel = rel.slice(0, slashIdx);
            sf = { id: "folder:" + subPath, label: subLabel, path: subPath, fileCount: 0, inboundCount: 0, outboundCount: 0, category: "other", memberIds: [] };
            subFolders.set(subPath, sf);
          }
          sf.fileCount++;
          sf.inboundCount += f.inboundCount;
          sf.outboundCount += f.outboundCount;
          sf.memberIds.push(f.id);
        }
      }

      // Build node list: folder nodes + direct file nodes
      nodes = [
        ...[...subFolders.values()].map((sf) => ({
          id: sf.id, label: sf.label, path: sf.path,
          fileCount: sf.fileCount, inboundCount: sf.inboundCount, outboundCount: sf.outboundCount,
          category: "other" as const,
        })),
        ...directFiles,
      ];
      const displayNodeIds = new Set(nodes.map((n: any) => n.id));

      // Map edges: if source/target in sub-folder, replace with folder id
      const memberToFolder = new Map<string, string>();
      for (const sf of subFolders.values()) {
        for (const mid of sf.memberIds) memberToFolder.set(mid, sf.id);
      }
      let rawEdges = (graphData.edges ?? [])
        .filter((e) => (fileMap.has(e.source) || memberToFolder.has(e.source)) && (fileMap.has(e.target) || memberToFolder.has(e.target)))
        .map((e) => {
          const src = memberToFolder.get(e.source) ?? e.source;
          const tgt = memberToFolder.get(e.target) ?? e.target;
          return { id: e.id, source: src, target: tgt, importKind: e.importKind, isResolved: e.isResolved, edgeCount: 1 as number | undefined };
        })
        .filter((e) => displayNodeIds.has(e.source) && displayNodeIds.has(e.target) && e.source !== e.target);
      
      // Deduplicate edges (aggregate edgeCount)
      const edgeMap = new Map<string, { id: string; source: string; target: string; importKind: string; isResolved: boolean; edgeCount: number | undefined }>();
      for (const e of rawEdges) {
        const key = `${e.source}->${e.target}`;
        const agg = edgeMap.get(key);
        if (agg) {
          agg.edgeCount = (agg.edgeCount ?? 1) + 1;
        } else {
          edgeMap.set(key, { ...e });
        }
      }
      edges = Array.from(edgeMap.values());
      useFolder = false;
    } else if (currentNav.mode === "focus" && currentNav.focusNodeId && graphData) {
      // Focus: focus node + direct neighbors only
      const focusId = currentNav.focusNodeId;
      const allNodes = graphData.nodes ?? [];
      const allEdges = graphData.edges ?? [];
      const neighborIds = new Set<string>();
      for (const e of allEdges) {
        if (e.source === focusId) neighborIds.add(e.target);
        if (e.target === focusId) neighborIds.add(e.source);
      }
      neighborIds.add(focusId);
      nodes = allNodes
        .filter((n) => neighborIds.has(n.id))
        .map((n) => ({ ...n, fileCount: undefined as number | undefined }));
      edges = allEdges
        .filter((e) => neighborIds.has(e.source) && neighborIds.has(e.target))
        .map((e) => ({
          id: e.id, source: e.source, target: e.target,
          importKind: e.importKind, isResolved: e.isResolved, edgeCount: undefined as number | undefined,
        }));
      useFolder = false;
    }

    return { displayNodes: nodes, displayEdges: edges, displayUseFolder: useFolder };
  }, [graphData, currentNav, useFolderGraph]) as { displayNodes: any[]; displayEdges: any[]; displayUseFolder: boolean };

  useEffect(() => {
    setLoading(true);
    setError(null);
    window.codemap
      .getGraphData()
      .then((data) => {
        setGraphData(data);
        if (data?.error) {
          setError(data.error);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load graph");
      })
      .finally(() => setLoading(false));
  }, []);

  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [focusClusterNodes, setFocusClusterNodes] = useState<(ClusterNodeData & { id: string })[]>([]);
  const [focusClusterEdges, setFocusClusterEdges] = useState<Array<{ id: string; source: string; target: string }>>([]);

  // Async ELK layout (overview/structure) or star layout (focus)
  useEffect(() => {
    if (!graphData) return;
    const isNotOverview = currentNav.mode !== "overview";
    const srcNodes = displayUseFolder ? (graphData.folderNodes ?? []) : isNotOverview ? displayNodes : graphData.nodes;
    const srcEdges = displayUseFolder ? (graphData.folderEdges ?? []) : isNotOverview ? displayEdges : graphData.edges;
    if (srcNodes.length === 0) return;
    setLayoutLoading(true);

    // Focus mode: star layout with optional leaf clustering
    if (currentNav.mode === "focus" && currentNav.focusNodeId) {
      const focusId = currentNav.focusNodeId;
      const allNeighbors = srcNodes.filter((n) => n.id !== focusId);

      // Detect leaf nodes (degree=1 within this subgraph) — use any[] to avoid union-type inference issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outgoingLeaves: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const incomingLeaves: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nonLeaves: any[] = [];

      for (const n of allNeighbors) {
        const hasExtraConnection = srcEdges.some(
          (e) => (e.source === n.id && e.target !== focusId) || (e.target === n.id && e.source !== focusId),
        );
        if (!hasExtraConnection) {
          if (srcEdges.some((e) => e.source === focusId && e.target === n.id)) {
            outgoingLeaves.push(n);
          } else {
            incomingLeaves.push(n);
          }
        } else {
          nonLeaves.push(n);
        }
      }

      const shouldClusterOut = outgoingLeaves.length >= CLUSTER_THRESHOLD && !expandedClusters.has(`cluster:outgoing:${focusId}`);
      const shouldClusterIn = incomingLeaves.length >= CLUSTER_THRESHOLD && !expandedClusters.has(`cluster:incoming:${focusId}`);

      const getFileName = (p: string) => p.split("/").pop() ?? p;
      const clusteredLeafIds = new Set<string>();
      const clusterNodes: (ClusterNodeData & { id: string })[] = [];
      const clusterEdges: Array<{ id: string; source: string; target: string }> = [];

      if (shouldClusterOut) {
        const cid = `cluster:outgoing:${focusId}`;
        clusterNodes.push({
          id: cid, kind: "cluster", direction: "outgoing", focusId,
          nodeIds: outgoingLeaves.map((n) => n.id),
          count: outgoingLeaves.length,
          sample: outgoingLeaves.slice(0, 3).map((n) => getFileName(n.path ?? n.id)),
        });
        clusterEdges.push({ id: cid, source: focusId, target: cid });
        outgoingLeaves.forEach((n) => clusteredLeafIds.add(n.id));
      }

      if (shouldClusterIn) {
        const cid = `cluster:incoming:${focusId}`;
        clusterNodes.push({
          id: cid, kind: "cluster", direction: "incoming", focusId,
          nodeIds: incomingLeaves.map((n) => n.id),
          count: incomingLeaves.length,
          sample: incomingLeaves.slice(0, 3).map((n) => getFileName(n.path ?? n.id)),
        });
        clusterEdges.push({ id: cid, source: cid, target: focusId });
        incomingLeaves.forEach((n) => clusteredLeafIds.add(n.id));
      }

      // 3-column layout: incoming (left) | focus (center) | outgoing (right)
      // Each column is stacked vertically; cluster nodes go at bottom of their column.
      const COL_GAP = 320; // horizontal gap between columns
      const ROW_GAP = 100; // vertical gap between rows

      // Classify visible (non-clustered) neighbors by direction
      const visibleOut = shouldClusterOut ? [] : outgoingLeaves;
      const visibleIn = shouldClusterIn ? [] : incomingLeaves;

      // nonLeaves: check their actual direction relative to focus
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nonLeafOut: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nonLeafIn: any[] = [];
      for (const n of nonLeaves) {
        const isOut = srcEdges.some((e) => e.source === focusId && e.target === n.id);
        if (isOut) nonLeafOut.push(n); else nonLeafIn.push(n);
      }
      const leftNodes = [...visibleIn, ...nonLeafIn];
      const rightNodes = [...visibleOut, ...nonLeafOut];

      function stackColumn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: any[],
        clusterNode: (ClusterNodeData & { id: string }) | undefined,
        x: number,
      ): Map<string, { x: number; y: number }> {
        const total = items.length + (clusterNode ? 1 : 0);
        const totalH = total * NODE_H + (total - 1) * (ROW_GAP - NODE_H);
        let startY = -totalH / 2;
        const pos = new Map<string, { x: number; y: number }>();
        for (const item of items) {
          pos.set(item.id, { x, y: startY });
          startY += ROW_GAP;
        }
        if (clusterNode) {
          pos.set(clusterNode.id, { x: x - (220 - NODE_W) / 2, y: startY });
        }
        return pos;
      }

      const posMap = new Map<string, { x: number; y: number }>();
      posMap.set(focusId, { x: 0, y: -(NODE_H / 2) });

      const leftMap = stackColumn(leftNodes, shouldClusterIn ? clusterNodes.find((c) => c.direction === "incoming") : undefined, -COL_GAP);
      const rightMap = stackColumn(rightNodes, shouldClusterOut ? clusterNodes.find((c) => c.direction === "outgoing") : undefined, COL_GAP);
      for (const [k, v] of leftMap) posMap.set(k, v);
      for (const [k, v] of rightMap) posMap.set(k, v);

      setFocusClusterNodes(clusterNodes);
      setFocusClusterEdges(clusterEdges);
      setLayoutMap(posMap);
      setLayoutLoading(false);
      return;
    }
    setFocusClusterNodes([]);
    setFocusClusterEdges([]);

    const dims = displayUseFolder || displayNodes.some((n: any) => (n.id as string).startsWith("folder:"))
      ? { w: FOLDER_W, h: FOLDER_H } : { w: NODE_W, h: NODE_H };
    elkLayout(srcNodes, srcEdges, dims)
      .then((posMap) => {
        setLayoutMap(posMap);
      })
      .finally(() => setLayoutLoading(false));
  }, [graphData, displayUseFolder, currentNav, expandedClusters]); // displayNodes/displayEdges derived from graphData+currentNav — stable enough

  const activeId = selectedId;
  const related = useMemo(
    () => (activeId ? relatedNodeIds(activeId, displayEdges) : new Set<string>()),
    [activeId, displayEdges],
  );

  const [flowNodes, setFlowNodes] = useState<Node[]>([]);

  // Update flow nodes when layout or display data changes
  useEffect(() => {
    if (!layoutMap) return;
    const hasActive = activeId !== null;
    const fileNodes = displayNodes
      .filter((n) => layoutMap.has(n.id))
      .map((n) => ({
        id: n.id,
        type: (n.id as string).startsWith("folder:") || displayUseFolder ? "folder" : "dependency",
        position: layoutMap.get(n.id)!,
        data: n as unknown as Record<string, unknown>,
        selected: n.id === activeId,
        className: hasActive && !related.has(n.id) ? "opacity-30" : undefined,
      }));
    const clNodes = focusClusterNodes
      .filter((cn) => layoutMap.has(cn.id))
      .map((cn) => ({
        id: cn.id,
        type: "cluster",
        position: layoutMap.get(cn.id)!,
        data: cn as unknown as Record<string, unknown>,
        selected: false,
        className: hasActive && !related.has(cn.id) ? "opacity-30" : undefined,
      }));
    setFlowNodes([...fileNodes, ...clNodes]);
  }, [displayNodes, focusClusterNodes, layoutMap, activeId, related, displayUseFolder]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setFlowNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const rfEdges = useMemo<Edge[]>(() => {
    const isFocus = currentNav.mode === "focus";
    const focusId = currentNav.focusNodeId;

    const edgeStyle = (
      isCycle: boolean,
      isRel: boolean,
      isFaded: boolean,
      directionOut: boolean,
    ) => {
      if (isFaded) return { stroke: "var(--border)", strokeWidth: 0.5, opacity: 0.15 };
      if (isCycle) return { stroke: "#ef4444", strokeWidth: 1.5, opacity: 0.7 };
      const color = isRel ? (directionOut ? "#a78bfa" : "#60a5fa") : "var(--border-strong)";
      const extra = isFocus && directionOut ? { strokeDasharray: "8 4" } : {};
      return { stroke: color, strokeWidth: isRel ? 1.5 : 0.5, opacity: isRel ? 0.7 : 0.18, ...extra };
    };

    const mapEdge = (id: string, source: string, target: string): Edge => {
      const isCycleEdge = Boolean(
        (displayNodes.find((n) => n.id === source) as Record<string, unknown> | undefined)?.isInCycle &&
        (displayNodes.find((n) => n.id === target) as Record<string, unknown> | undefined)?.isInCycle,
      );
      const isRelated = related.has(source) && related.has(target);
      const isFaded = activeId !== null && !isRelated;
      const directionOut = source === focusId;
      const markerColor = isCycleEdge ? "#ef4444" : isRelated ? (directionOut ? "#a78bfa" : "#60a5fa") : "var(--muted)";
      return {
        id, source, target, type: "default",
        animated: isFocus && !isFaded,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: markerColor },
        style: edgeStyle(isCycleEdge, isRelated, isFaded, directionOut),
      };
    };

    const regular = displayEdges.map(({ id, source, target }) => mapEdge(id, source, target));
    const cluster = focusClusterEdges.map(({ id, source, target }) => mapEdge(id, source, target));
    return [...regular, ...cluster];
  }, [displayEdges, focusClusterEdges, related, displayNodes, currentNav, activeId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeTypes = useMemo(() => ({
    dependency: DependencyNode as any,
    folder: FolderNode as any,
    cluster: ClusterNode as any,
  }), []);

  // Reset expanded clusters when leaving focus mode
  useEffect(() => {
    if (currentNav.mode !== "focus") setExpandedClusters(new Set());
  }, [currentNav.mode]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Cluster click → expand (show individual nodes instead of summary)
      if (node.type === "cluster") {
        const cid = node.id;
        setExpandedClusters((prev) => {
          const next = new Set(prev);
          if (next.has(cid)) { next.delete(cid); } else { next.add(cid); }
          return next;
        });
        return;
      }
      // Folder click in overview or structure → drill to structure
      if (node.type === "folder" && (currentNav.mode === "overview" || currentNav.mode === "structure")) {
        const targetNode = displayNodes.find((n) => n.id === node.id);
        if (targetNode) {
          pushNav({ mode: "structure", folder: { id: node.id, path: targetNode.path } });
          setSelectedId(null);
          return;
        }
      }
      // File click in structure → focus
      if (node.type === "dependency" && currentNav.mode === "structure") {
        pushNav({ mode: "focus", folder: currentNav.folder, focusNodeId: node.id });
        return;
      }
      // File click in overview or focus → select
      setSelectedId(node.id);
    },
    [currentNav, displayNodes, pushNav],
  );

  return (
    <section className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden" aria-label="Code map">
      <header className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {currentNav.mode !== "overview" ? (
              <button
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground -ml-1 px-1 py-0.5 rounded"
                onClick={() => { popNav(); setSelectedId(null); setLayoutMap(null); }}
              >
                ← Back
              </button>
            ) : (
              "Code map"
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentNav.mode === "structure" && currentNav.folder
              ? currentNav.folder.path
              : currentNav.mode === "focus" && currentNav.focusNodeId
                ? (graphData?.nodes?.find((n) => n.id === currentNav.focusNodeId)?.path ?? currentNav.focusNodeId)
                : "Module relationships and change impact"}
          </p>
        </div>
        <span className="codemap-view-label">
          {currentNav.mode === "overview" ? "Graph" : currentNav.mode === "structure" ? "Structure" : "Focus"}
        </span>
      </header>

      <div className="flex-1 min-h-0 border border-border rounded-[10px] bg-card overflow-hidden">
        {loading ? (
          <div className="codemap-loading">
            <span className="codemap-loading-spinner" aria-hidden="true" />
            <span>Loading dependency graph…</span>
          </div>
        ) : error ? (
          <div className="codemap-error">
            <span>Failed to load graph</span>
            <span className="codemap-error-detail">{error}</span>
          </div>
        ) : displayNodes.length === 0 ? (
            <div className="codemap-empty">
              <span>{currentNav.mode !== "overview" ? "No files found" : "No project linked"}</span>
              <span className="codemap-empty-detail">{currentNav.mode !== "overview" ? "This folder has no indexed files." : "Link a CodeMap project to see the dependency graph."}</span>
            </div>
        ) : layoutLoading || !layoutMap ? (
          <div className="codemap-loading">
            <span className="codemap-loading-spinner" aria-hidden="true" />
            <span>Computing layout…</span>
          </div>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.05 }}
            nodeOrigin={[0, 0]}
            panOnScroll
            selectionOnDrag
            deleteKeyCode={["Backspace", "Delete"]}
            zoomOnDoubleClick={false}
            minZoom={0.05}
            maxZoom={2}
            colorMode="system"
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border-strong)" gap={20} size={1} />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </section>
  );
}
