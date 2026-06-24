import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, BaseEdge, getBezierPath, applyNodeChanges, useReactFlow, type EdgeProps, type Node, type Edge, type OnNodesChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ElkConstructor from "elkjs/lib/elk.bundled.js";
import type { GraphNode, GraphData } from "../../shared/ipc.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const elk = new (ElkConstructor as any)();

const NODE_W = 280;
const NODE_H = 72;
const FOLDER_W = 300;
const FOLDER_H = 96;

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
  forcedAlgo?: string,
): Promise<{ positions: Map<string, { x: number; y: number }>; algo: string }> {
  if (nodes.length === 0) return { positions: new Map(), algo: forcedAlgo ?? "layered" };

  const algo = forcedAlgo ?? (nodes.length <= 20 ? "mrtree" : nodes.length <= 80 ? "layered" : "stress");

  const algoOpts: Record<string, string> = algo === "layered" ? {
    "elk.direction": "RIGHT",
    "elk.edgeRouting": "SPLINES",
    "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
    "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    "elk.layered.thoroughness": "10",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  } : algo === "mrtree" ? {
    "elk.direction": "DOWN",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.mrtree.edgeRoutingMode": "AVOID_OVERLAP",
  } : {
    "elk.direction": "RIGHT",
    "elk.edgeRouting": "SPLINES",
  };

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": algo,
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
      "elk.spacing.nodeNode": "40",
      "elk.spacing.componentComponent": "40",
      ...algoOpts,
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
  return {
    algo,
    positions: new Map(
      (result.children ?? []).map((c: { id: string; x?: number; y?: number }) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
    ),
  };
}

function relatedNodeIds(selectedId: string, edges: { source: string; target: string }[]) {
  const related = new Set([selectedId]);
  for (const { source, target } of edges) {
    if (source === selectedId) related.add(target);
    if (target === selectedId) related.add(source);
  }
  return related;
}

function FolderNode({ data, selected }: { data: { label: string; fileCount?: number; inboundCount?: number; outgoingCount?: number; id?: string; path?: string; isInCycle?: boolean; treeMode?: boolean; expanded?: boolean; focusMode?: boolean }; selected: boolean }) {
  const tgt = data?.treeMode ? Position.Top : Position.Left;
  const src = data?.treeMode ? Position.Bottom : Position.Right;
  const expanded = data?.expanded ?? false;
  return (
    <>
      <Handle type="target" position={tgt} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/40 !rounded-full" />
      <div className={`codemap-folder-node${selected ? " selected" : ""}${expanded ? " expanded" : ""}`}>
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
        {data?.focusMode && (
        <span
          className="codemap-folder-chevron"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("codemap-folder-toggle", { detail: { id: data.id } }));
          }}
        >
          {expanded ? "⌄" : "›"}
        </span>
        )}
      </div>
      <Handle type="source" position={src} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/40 !rounded-full" />
    </>
  );
}

function DependencyNode({ data, selected }: { data: GraphNode & { treeMode?: boolean }; selected: boolean }) {
  const label = data?.label ?? data?.path?.split("/").pop() ?? "?";
  const dirPath = data?.dirPath ?? "";
  const isInCycle = data?.isInCycle ?? false;

  return (
    <>
      <Handle type="target" position={data?.treeMode ? Position.Top : Position.Left} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/50 !rounded-full" />
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
            {data?.language && (
              <span className="codemap-language-badge">{data.language as string}</span>
            )}
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
      <Handle type="source" position={data?.treeMode ? Position.Bottom : Position.Right} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/50 !rounded-full" />
    </>
  );
}

export function CodeMapPanel() {
  const { fitView } = useReactFlow();
  const lastFittedRef = useRef<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutMap, setLayoutMap] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [layoutAlgo, setLayoutAlgo] = useState<string>("layered");
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [navStack, setNavStack] = useState<NavState[]>([{ mode: "overview" }]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
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
      // Focus: focus node + direct neighbors with sub-folder grouping for outgoing
      const focusId = currentNav.focusNodeId;
      const allNodes = graphData.nodes ?? [];
      const allEdges = graphData.edges ?? [];
      // Separate incoming vs outgoing neighbors
      const outgoingIds = new Set<string>();
      const incomingIds = new Set<string>();
      for (const e of allEdges) {
        if (e.source === focusId) outgoingIds.add(e.target);
        if (e.target === focusId) incomingIds.add(e.source);
      }

      // Incoming neighbors — always individual file nodes
      const incomingFiles = allNodes.filter((n) => incomingIds.has(n.id));

      // Outgoing neighbors — group by immediate parent dir
      const outgoingFiles = allNodes.filter((n) => outgoingIds.has(n.id));
      const totalOutgoing = outgoingFiles.length;
      // Group if >= 4 files, OR >= 3 files and occupy >= 40% of outgoing neighbors
      const shouldGroup = (files: typeof outgoingFiles) =>
        files.length >= 4 || (files.length >= 3 && totalOutgoing > 0 && files.length / totalOutgoing >= 0.4);

      const dirGroups = new Map<string, typeof outgoingFiles>();
      for (const f of outgoingFiles) {
        const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : ".";
        if (!dirGroups.has(dir)) dirGroups.set(dir, []);
        dirGroups.get(dir)!.push(f);
      }

      const subFolders: Array<{ id: string; label: string; path: string; fileCount: number; inboundCount: number; outboundCount: number; memberIds: string[] }> = [];
      const groupedIds = new Set<string>();
      for (const [dir, files] of dirGroups) {
        if (shouldGroup(files)) {
          const label = dir === "." ? "/" : dir.split("/").pop()!;
          subFolders.push({
            id: `folder:${dir}`,
            label,
            path: dir,
            fileCount: files.length,
            inboundCount: files.reduce((s, f) => s + (f.inboundCount ?? 0), 0),
            outboundCount: files.reduce((s, f) => s + (f.outboundCount ?? 0), 0),
            memberIds: files.map((f) => f.id),
          });
          for (const f of files) groupedIds.add(f.id);
        }
      }

      // Direct outgoing files (not grouped) + focus node
      const directOutgoing = outgoingFiles.filter((f) => !groupedIds.has(f.id));
      const focusNode = allNodes.find((n) => n.id === focusId);

      // Build display nodes: focus + incoming + folder nodes (or expanded files) + direct outgoing
      const expandedSubFolderFiles: typeof outgoingFiles = [];
      nodes = [
        ...(focusNode ? [{ ...focusNode, fileCount: undefined as number | undefined }] : []),
        ...incomingFiles.map((n) => ({ ...n, fileCount: undefined as number | undefined })),
        ...subFolders.flatMap((sf) => {
          if (expandedFolders.has(sf.id)) {
            const files = dirGroups.get(sf.path)!;
            expandedSubFolderFiles.push(...files);
            return files.map((n) => ({ ...n, fileCount: undefined as number | undefined }));
          }
          return [{
            id: sf.id, label: sf.label, path: sf.path,
            fileCount: sf.fileCount, inboundCount: sf.inboundCount, outboundCount: sf.outboundCount,
            category: "other" as const, dirPath: undefined, isInCycle: false, language: undefined,
          }];
        }),
        ...directOutgoing.map((n) => ({ ...n, fileCount: undefined as number | undefined })),
      ];

      // Build edges: map file edges → folder edges where applicable (skip expanded folders)
      const memberToFolder = new Map<string, string>();
      for (const sf of subFolders) {
        if (!expandedFolders.has(sf.id)) {
          for (const mid of sf.memberIds) memberToFolder.set(mid, sf.id);
        }
      }

      const rawEdges = allEdges
        .filter((e) => {
          const srcIn = e.source === focusId || incomingIds.has(e.source) || memberToFolder.has(e.source) || directOutgoing.some((f) => f.id === e.source);
          const tgtIn = e.target === focusId || outgoingIds.has(e.target) || memberToFolder.has(e.target) || directOutgoing.some((f) => f.id === e.target);
          return srcIn && tgtIn && e.source !== e.target;
        })
        .map((e) => ({
          id: e.id, source: memberToFolder.get(e.source) ?? e.source, target: memberToFolder.get(e.target) ?? e.target,
          importKind: e.importKind, isResolved: e.isResolved, edgeCount: undefined as number | undefined,
        }));

      // Dedup edges
      const edgeMap = new Map<string, typeof rawEdges[0]>();
      for (const e of rawEdges) {
        const key = `${e.source}->${e.target}`;
        if (!edgeMap.has(key)) edgeMap.set(key, e);
      }
      edges = Array.from(edgeMap.values());
      useFolder = false;
    }

    return { displayNodes: nodes, displayEdges: edges, displayUseFolder: useFolder };
  }, [graphData, currentNav, useFolderGraph, expandedFolders]) as { displayNodes: any[]; displayEdges: any[]; displayUseFolder: boolean };

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

  // Async ELK layout for all modes
  useEffect(() => {
    if (!graphData) return;
    const isNotOverview = currentNav.mode !== "overview";
    const srcNodes = displayUseFolder ? (graphData.folderNodes ?? []) : isNotOverview ? displayNodes : graphData.nodes;
    const srcEdges = displayUseFolder ? (graphData.folderEdges ?? []) : isNotOverview ? displayEdges : graphData.edges;
    if (srcNodes.length === 0) return;
    setLayoutLoading(true);

    const dims = displayUseFolder || displayNodes.some((n: any) => (n.id as string).startsWith("folder:"))
      ? { w: FOLDER_W, h: FOLDER_H } : { w: NODE_W, h: NODE_H };
    const forcedAlgo = currentNav.mode === "focus" ? "layered" : undefined;
    elkLayout(srcNodes, srcEdges, dims, forcedAlgo)
      .then(({ positions, algo }) => {
        setLayoutMap(positions);
        setLayoutAlgo(algo);
      })
      .finally(() => setLayoutLoading(false));
  }, [graphData, displayUseFolder, currentNav, displayNodes, displayEdges]);

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
        data: { ...(n as unknown as Record<string, unknown>), treeMode: layoutAlgo === "mrtree", expanded: (n.id as string).startsWith("folder:") && expandedFolders.has(n.id as string), focusMode: currentNav.mode === "focus" },
        selected: n.id === activeId,
        className: hasActive && !related.has(n.id) ? "opacity-30" : undefined,
      }));
    setFlowNodes(fileNodes);

    // Auto-fitView when entering focus mode
    if (currentNav.mode === "focus" && currentNav.focusNodeId && lastFittedRef.current !== currentNav.focusNodeId) {
      lastFittedRef.current = currentNav.focusNodeId;
      setTimeout(() => fitView({ duration: 300, padding: 0.1 }), 80);
    }
  }, [displayNodes, layoutMap, activeId, related, displayUseFolder, expandedFolders, currentNav, fitView]);

  // Listen for folder chevron click to toggle expand
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as string;
      if (!id) return;
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      // Reset active to focus node when expanding (folder node disappears from displayNodes)
      setSelectedId(currentNav.focusNodeId ?? null);
    };
    window.addEventListener("codemap-folder-toggle", handler);
    return () => window.removeEventListener("codemap-folder-toggle", handler);
  }, [currentNav.focusNodeId]);

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
      const color = isRel ? (directionOut ? "#a78bfa" : "#60a5fa") : "#94a3b8";
      const extra = isFocus && directionOut ? { strokeDasharray: "8 4" } : {};
      const w = isFocus && !directionOut ? 0.5 : isRel ? 1.5 : 1;
      return { stroke: color, strokeWidth: w, opacity: isRel ? 0.9 : 0.55, ...extra };
    };

    const mapEdge = (id: string, source: string, target: string): Edge => {
      const isCycleEdge = Boolean(
        (displayNodes.find((n) => n.id === source) as Record<string, unknown> | undefined)?.isInCycle &&
        (displayNodes.find((n) => n.id === target) as Record<string, unknown> | undefined)?.isInCycle,
      );
      const isRelated = related.has(source) && related.has(target);
      const isFaded = activeId !== null && !isRelated;
      const directionOut = source === focusId;
      const markerColor = isCycleEdge ? "#ef4444" : isRelated ? (directionOut ? "#a78bfa" : "#60a5fa") : "#9ca3af";
      return {
        id,
        source,
        target,
        type: "focus",
        data: isFocus
          ? { flow: directionOut ? "outgoing" : "incoming", active: isRelated && selectedId !== null }
          : { mode: layoutAlgo === "mrtree" ? "mrtree" : "structure" },
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: markerColor },
        style: edgeStyle(isCycleEdge, isRelated, isFaded, directionOut),
      };
    };

    return displayEdges.map(({ id, source, target }) => mapEdge(id, source, target));
  }, [displayEdges, related, displayNodes, currentNav, activeId, selectedId, layoutAlgo]);

  const FocusEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
  }: EdgeProps<Edge<{ flow?: "incoming" | "outgoing"; active?: boolean; mode?: "structure" | "mrtree" }>>) => {
    const pathArgs = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
    const [edgePath] = getBezierPath(pathArgs);
    const isIncoming = data?.flow === "incoming";
    const isActive = data?.active === true;
    const isStructure = data?.mode === "structure";

    return (
      <>
        <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
        {isStructure ? (
          <circle r="3" fill="#facc15" opacity={0.85}>
            <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} />
          </circle>
        ) : isIncoming ? (
          isActive ? (
            <circle r="5" fill="#3b82f6">
              <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} />
            </circle>
          ) : (
            <circle r="3" fill="#facc15" opacity={0.85} />
          )
        ) : null}
      </>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeTypes = useMemo(() => ({
    dependency: DependencyNode as any,
    folder: FolderNode as any,
  }), []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edgeTypes = useMemo(() => ({
    focus: FocusEdge as any,
  }), []);

  // Active node info from selectedId
  const selectedNodeData = useMemo(() => {
    if (!selectedId || !graphData) return null;
    const node = graphData.nodes?.find((n) => n.id === selectedId);
    if (node) {
      return {
        id: node.id,
        label: node.label ?? node.path?.split("/").pop() ?? selectedId,
        path: node.path ?? selectedId,
        language: node.language,
        inboundCount: node.inboundCount ?? 0,
        outgoingCount: node.outboundCount ?? 0,
        isInCycle: node.isInCycle ?? false,
        type: "dependency",
      };
    }
    const folder = graphData.folderNodes?.find((f) => f.id === selectedId);
    if (folder) {
      return {
        id: folder.id,
        label: folder.folder.split("/").pop() ?? folder.folder,
        path: folder.folder,
        language: undefined,
        inboundCount: folder.incomingCount ?? 0,
        outgoingCount: folder.outgoingCount ?? 0,
        isInCycle: false,
        type: "folder",
        fileCount: folder.fileCount,
      };
    }
    return null;
  }, [selectedId, graphData]);

  // Compute imports/imported-by for selected node
  const activeDetail = useMemo(() => {
    if (!selectedId || !graphData?.edges) return null;
    const imports: { id: string; label: string; path: string }[] = [];
    const importedBy: { id: string; label: string; path: string }[] = [];
    for (const e of graphData.edges) {
      if (e.target === selectedId) {
        const src = graphData.nodes?.find((n) => n.id === e.source);
        imports.push({ id: e.source, label: src?.label ?? e.source, path: src?.path ?? e.source });
      }
      if (e.source === selectedId) {
        const tgt = graphData.nodes?.find((n) => n.id === e.target);
        importedBy.push({ id: e.target, label: tgt?.label ?? e.target, path: tgt?.path ?? e.target });
      }
    }
    return { imports, importedBy };
  }, [selectedId, graphData]);

  // Single click → select node + show info panel
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedId(node.id);
    },
    [],
  );

  // Double click → navigate (drill down / enter focus)
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
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
        setSelectedId(node.id);
        return;
      }
      // File click in focus → re-focus on that file
      if (node.type === "dependency" && currentNav.mode === "focus" && node.id !== currentNav.focusNodeId) {
        pushNav({ mode: "focus", folder: currentNav.folder, focusNodeId: node.id });
        setSelectedId(node.id);
        return;
      }
      // Folder click in focus → expand/collapse
      if (node.type === "folder" && currentNav.mode === "focus") {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.has(node.id) ? next.delete(node.id) : next.add(node.id);
          return next;
        });
        // Folder node disappears from displayNodes when expanded → reset to focus node
        setSelectedId(currentNav.focusNodeId ?? null);
        return;
      }
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
                onClick={() => { popNav(); setSelectedId(null); setLayoutMap(null); setExpandedFolders(new Set()); }}
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

        {selectedNodeData && selectedNodeData.type === "dependency" && (
          <div className="codemap-node-info flex-1">
            <div className="codemap-node-info-title">
              <strong>{selectedNodeData.label}</strong>
              {selectedNodeData.language && <span className="codemap-language-badge">{selectedNodeData.language}</span>}
            </div>
            <div className="codemap-node-info-stats">
              <span className="stat-in">↓{selectedNodeData.inboundCount}</span>
              <span className="stat-out">↑{selectedNodeData.outgoingCount}</span>
              {selectedNodeData.isInCycle && <span className="codemap-tooltip-cycle">⚠ Cycle</span>}
            </div>
          </div>
        )}

        <span className="codemap-view-label">
          {currentNav.mode === "overview" ? "Graph" : currentNav.mode === "structure" ? "Structure" : "Focus"}
        </span>
      </header>

      <div className="codemap-map-container relative flex-1 flex flex-col min-h-0">
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
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
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

      {/* Legend overlay — bottom-left corner of graph */}
      <div className="codemap-legend">
        <div className="codemap-legend-row"><span className="codemap-legend-dot" style={{ background: "#94a3b8" }} />Dependency</div>
        {currentNav.mode === "focus" && <>
          <div className="codemap-legend-row"><span className="codemap-legend-line" style={{ background: "#60a5fa" }} />Imports this file</div>
          <div className="codemap-legend-row"><span className="codemap-legend-line" style={{ background: "#a78bfa", borderStyle: "dashed" }} />This file imports</div>
        </>}
        <div className="codemap-legend-row"><span className="codemap-legend-line" style={{ background: "#ef4444" }} />Circular dep</div>
        <div className="codemap-legend-divider" />
        <div className="codemap-legend-row codemap-legend-hint">Click to select · Double-click to open</div>
      </div>

      {/* Detail panel (imports/imported by) — only show when there's actual data */}
      {activeDetail && (activeDetail.imports.length > 0 || activeDetail.importedBy.length > 0) && (
        <div className="codemap-detail-panel">
          <div className="codemap-detail-section">
            <h4 className="codemap-detail-heading">IMPORTS ({activeDetail.imports.length})</h4>
            {activeDetail.imports.length === 0 ? (
              <span className="codemap-detail-empty">None</span>
            ) : (
              <ul className="codemap-detail-list">
                {activeDetail.imports.slice(0, 8).map((f) => (
                  <li key={f.id} className="codemap-detail-file">{f.path}</li>
                ))}
                {activeDetail.imports.length > 8 && (
                  <li className="codemap-detail-more">+{activeDetail.imports.length - 8} more</li>
                )}
              </ul>
            )}
          </div>
          <div className="codemap-detail-section">
            <h4 className="codemap-detail-heading">IMPORTED BY ({activeDetail.importedBy.length})</h4>
            {activeDetail.importedBy.length === 0 ? (
              <span className="codemap-detail-empty">None</span>
            ) : (
              <ul className="codemap-detail-list">
                {activeDetail.importedBy.slice(0, 8).map((f) => (
                  <li key={f.id} className="codemap-detail-file">{f.path}</li>
                ))}
                {activeDetail.importedBy.length > 8 && (
                  <li className="codemap-detail-more">+{activeDetail.importedBy.length - 8} more</li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      </div>
    </section>
  );
}
