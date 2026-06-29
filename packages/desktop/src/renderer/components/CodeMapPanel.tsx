import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, BaseEdge, getBezierPath, applyNodeChanges, useReactFlow, useUpdateNodeInternals, EdgeLabelRenderer, NodeToolbar, type EdgeProps, type Node, type Edge, type OnNodesChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ElkConstructor from "elkjs/lib/elk.bundled.js";
import type { GraphNode, GraphData } from "../../shared/ipc.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const elk = new (ElkConstructor as any)();

const NODE_W = 280;
const NODE_H = 72;
const FOLDER_W = 300;
const FOLDER_H = 96;
const GROUP_HEADER_H = 40;
const ROW_GAP = 76;

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
      id: (n as any).id as string,
      width: (n as any).nodeWidth ?? (n as any)._elkWidth ?? dims.w,
      height: (n as any).nodeHeight ?? (n as any)._elkHeight ?? dims.h,
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

function GroupFolderNode({ data, selected }: { data: { label: string; path?: string; fileCount: number; memberIds: string[]; expanded: boolean; id: string; incomingSummaryCount?: number; outgoingSummaryCount?: number; internalEdgeCount?: number; previewLabels?: string[] }; selected: boolean }) {
  const expanded = data?.expanded ?? false;
  const previewLabels = data?.previewLabels ?? [];
  const remainingCount = Math.max(0, (data?.fileCount ?? 0) - previewLabels.length);
  const handleStyle = { opacity: 0, pointerEvents: "none" as const, width: 1, height: 1, minWidth: 0, minHeight: 0, border: "none", background: "transparent" };
  return (
    <>
      <Handle type="target" position={Position.Left} className="codemap-group-folder-handle codemap-group-folder-handle-left" style={handleStyle} />
      <Handle type="source" position={Position.Right} className="codemap-group-folder-handle codemap-group-folder-handle-right" style={handleStyle} />
      <div className={`codemap-group-folder${expanded ? " expanded" : " collapsed"}${selected ? " selected" : ""}`}>
        <div className="codemap-group-folder-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="codemap-group-folder-icon">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <div className="codemap-group-folder-title">
            <span className="codemap-group-folder-label">{data?.label ?? "?"}</span>
            <span className="codemap-group-folder-files">{data?.fileCount ?? 0} files</span>
          </div>
          <div className="codemap-group-folder-metrics">
            <span className="codemap-group-folder-metric stat-in" title="Unique files importing this group">↓{data?.incomingSummaryCount ?? 0}</span>
            <span className="codemap-group-folder-metric stat-out" title="Unique files this group imports">↑{data?.outgoingSummaryCount ?? 0}</span>
            <span className="codemap-group-folder-metric" title="Dependencies between files inside this group">↔{data?.internalEdgeCount ?? 0}</span>
          </div>
          <span
            className="codemap-group-folder-chevron"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("codemap-group-toggle", { detail: { id: data.id } }));
            }}
          >
            {expanded ? "⌄" : "›"}
          </span>
        </div>
        {!expanded && previewLabels.length > 0 && (
          <div className="codemap-group-folder-preview" title={data?.path ?? data?.label ?? ""}>
            {previewLabels.map((label) => (
              <span key={label} className="codemap-group-folder-preview-chip">{label}</span>
            ))}
            {remainingCount > 0 && (
              <span className="codemap-group-folder-preview-more">+{remainingCount} more</span>
            )}
          </div>
        )}
        {!expanded && (
          <div className="codemap-group-folder-tooltip" role="note">
            <div className="codemap-group-folder-tooltip-path">{data?.path ?? data?.label ?? ""}</div>
            <div className="codemap-group-folder-tooltip-files">{data?.fileCount ?? 0} files</div>
            {previewLabels.map((label) => (
              <div key={label} className="codemap-group-folder-tooltip-line">{label}</div>
            ))}
            {remainingCount > 0 && (
              <div className="codemap-group-folder-tooltip-more">+{remainingCount} more files</div>
            )}
            <div className="codemap-group-folder-tooltip-hint">Click chevron to expand</div>
          </div>
        )}
        {expanded && (
          <div className="codemap-group-folder-children" />
        )}
      </div>
    </>
  );
}

function FolderNode({ data, selected }: { data: { label: string; fileCount?: number; inboundCount?: number; outgoingCount?: number; id?: string; path?: string; isInCycle?: boolean; treeMode?: boolean; expanded?: boolean; focusMode?: boolean }; selected: boolean }) {
  const tgt = data?.treeMode ? Position.Top : Position.Left;
  const src = data?.treeMode ? Position.Bottom : Position.Right;
  return (
    <>
      <Handle type="target" position={tgt} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/40 !rounded-full" />
      <div className={`codemap-folder-node${selected ? " selected" : ""}${data?.expanded ? " expanded" : ""}`}>
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
      <Handle type="source" position={src} className="!w-[5px] !h-[5px] !border-0 !bg-[var(--muted-foreground)]/40 !rounded-full" />
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="codemap-node-toolbar">
          <button
            className="codemap-node-toolbar-btn"
            onClick={() => navigator.clipboard.writeText(data?.path ?? "")}
            title="Copy path"
          >
            📋 Copy path
          </button>
        </div>
      </NodeToolbar>
    </>
  );
}

function DependencyNode({ data, selected }: { data: GraphNode & { treeMode?: boolean; insideGroup?: boolean }; selected: boolean }) {
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
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="codemap-node-toolbar">
          <button
            className="codemap-node-toolbar-btn"
            onClick={() => navigator.clipboard.writeText(data?.path ?? "")}
            title="Copy path"
          >
            📋 Copy path
          </button>
          <button
            className="codemap-node-toolbar-btn"
            onClick={() => window.dispatchEvent(new CustomEvent("codemap-node-focus", { detail: { id: data?.id, path: data?.path } }))}
            title="Focus"
          >
            🔍 Focus
          </button>
        </div>
      </NodeToolbar>
    </>
  );
}

export function CodeMapPanel({ focusedPath }: { focusedPath?: string | null } = {}) {
  const { fitView } = useReactFlow();
  const lastFittedRef = useRef<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusError, setFocusError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutMap, setLayoutMap] = useState<Map<string, { x: number; y: number }> | null>(null);
  const [layoutAlgo, setLayoutAlgo] = useState<string>("layered");
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [navStack, setNavStack] = useState<NavState[]>([{ mode: "overview" }]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredEdgeLabel, setHoveredEdgeLabel] = useState<{ label: string; x: number; y: number } | null>(null);
  const currentNav = navStack[navStack.length - 1];
  const pushNav = (s: NavState) => setNavStack((prev) => [...prev, s]);

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
      // Focus: focus node + direct neighbors with group nodes for outgoing sub-folders
      // Group nodes use id prefix "group:" and always exist in displayNodes.
      // File children exist in displayNodes only when the group is expanded.
      const focusId = currentNav.focusNodeId;
      const allNodes = graphData.nodes ?? [];
      const allEdges = graphData.edges ?? [];
      const outgoingIds = new Set<string>();
      const incomingIds = new Set<string>();
      for (const e of allEdges) {
        if (e.source === focusId) outgoingIds.add(e.target);
        if (e.target === focusId) incomingIds.add(e.source);
      }

      const incomingFiles = allNodes.filter((n) => incomingIds.has(n.id));
      const outgoingFiles = allNodes.filter((n) => outgoingIds.has(n.id));
      const totalOutgoing = outgoingFiles.length;
      const shouldGroup = (files: typeof outgoingFiles) =>
        files.length >= 4 || (files.length >= 3 && totalOutgoing > 0 && files.length / totalOutgoing >= 0.4);

      const dirGroups = new Map<string, typeof outgoingFiles>();
      for (const f of outgoingFiles) {
        const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : ".";
        if (!dirGroups.has(dir)) dirGroups.set(dir, []);
        dirGroups.get(dir)!.push(f);
      }

      // Build group nodes (always present) and collect expanded children
      const groupNodes: Array<{ id: string; label: string; path: string; fileCount: number; inboundCount: number; outboundCount: number; incomingSummaryCount: number; outgoingSummaryCount: number; internalEdgeCount: number; memberIds: string[]; previewLabels: string[]; childrenHeight: number }> = [];
      const groupedIds = new Set<string>();

      for (const [dir, files] of dirGroups) {
        if (!shouldGroup(files)) continue;
        const label = dir === "." ? "/" : dir.split("/").pop()!;
        const groupId = `group:${dir}`;
        const memberIds = files.map((f) => f.id);
        const memberIdSet = new Set(memberIds);
        for (const f of files) groupedIds.add(f.id);

        let internalEdgeCount = 0;
        const incomingSummaryIds = new Set<string>();
        const outgoingSummaryIds = new Set<string>();
        for (const e of allEdges) {
          const sourceInGroup = memberIdSet.has(e.source);
          const targetInGroup = memberIdSet.has(e.target);
          if (sourceInGroup && targetInGroup) {
            internalEdgeCount += 1;
            continue;
          }
          if (targetInGroup) incomingSummaryIds.add(e.source);
          if (sourceInGroup) outgoingSummaryIds.add(e.target);
        }

        groupNodes.push({
          id: groupId, label, path: dir,
          fileCount: files.length,
          inboundCount: files.reduce((s, f) => s + (f.inboundCount ?? 0), 0),
          outboundCount: files.reduce((s, f) => s + (f.outboundCount ?? 0), 0),
          incomingSummaryCount: incomingSummaryIds.size,
          outgoingSummaryCount: outgoingSummaryIds.size,
          internalEdgeCount,
          memberIds,
          previewLabels: files.slice(0, 3).map((f) => f.label ?? f.path.split("/").pop() ?? f.id),
          childrenHeight: files.length * ROW_GAP,
        });
      }

      const directOutgoing = outgoingFiles.filter((f) => !groupedIds.has(f.id));
      const focusNode = allNodes.find((n) => n.id === focusId);

      // Build displayNodes — children are NOT included (added via flowNodes from graphData)
      nodes = [
        ...(focusNode ? [{ ...focusNode, fileCount: undefined as number | undefined }] : []),
        ...incomingFiles.map((n) => ({ ...n, fileCount: undefined as number | undefined })),
        // Group nodes — always present, children added in flowNodes when expanded
        ...groupNodes.map((g) => ({
          id: g.id, label: g.label, path: g.path,
          fileCount: g.fileCount, inboundCount: g.inboundCount, outboundCount: g.outboundCount,
          incomingSummaryCount: g.incomingSummaryCount, outgoingSummaryCount: g.outgoingSummaryCount, internalEdgeCount: g.internalEdgeCount,
          memberIds: g.memberIds, previewLabels: g.previewLabels, childrenHeight: g.childrenHeight,
          nodeWidth: 300, nodeHeight: GROUP_HEADER_H + g.childrenHeight,
          groupType: "groupFolder" as const,
          category: "other" as const, dirPath: undefined, isInCycle: false, language: undefined,
        })),
        ...directOutgoing.map((n) => ({ ...n, fileCount: undefined as number | undefined })),
      ];

      const memberToFolder = new Map<string, string>();
      const collapsedMemberToGroup = new Map<string, string>();
      for (const g of groupNodes) {
        for (const mid of g.memberIds) {
          memberToFolder.set(mid, g.id);
          if (!expandedFolders.has(g.id)) collapsedMemberToGroup.set(mid, g.id);
        }
      }

      const rawEdges = allEdges
        .filter((e) => {
          const srcIn = e.source === focusId || incomingIds.has(e.source) || memberToFolder.has(e.source);
          const tgtIn = e.target === focusId || outgoingIds.has(e.target) || memberToFolder.has(e.target);
          return srcIn && tgtIn && e.source !== e.target;
        })
        .map((e) => ({
          id: e.id,
          source: collapsedMemberToGroup.get(e.source) ?? e.source,
          target: collapsedMemberToGroup.get(e.target) ?? e.target,
          importKind: e.importKind,
          isResolved: e.isResolved,
          edgeCount: undefined as number | undefined,
        }))
        .filter((e) => e.source !== e.target);

      const edgeMap = new Map<string, typeof rawEdges[0]>();
      for (const e of rawEdges) {
        const key = `${e.source}->${e.target}`;
        const agg = edgeMap.get(key);
        if (agg) {
          agg.edgeCount = (agg.edgeCount ?? 1) + 1;
        } else {
          edgeMap.set(key, { ...e, edgeCount: 1 });
        }
      }
      edges = Array.from(edgeMap.values());
      useFolder = false;
    }

    return { displayNodes: nodes, displayEdges: edges, displayUseFolder: useFolder };
  }, [graphData, currentNav, useFolderGraph, expandedFolders]) as { displayNodes: any[]; displayEdges: any[]; displayUseFolder: boolean };

  // Search filter — match nodes by label/path
  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    const m = new Set<string>();
    for (const n of displayNodes) {
      if ((n.label && n.label.toLowerCase().includes(q)) || (n.path && n.path.toLowerCase().includes(q))) {
        m.add(n.id);
      }
    }
    return m;
  }, [searchQuery, displayNodes]);

  const graphNodeByNormalizedPath = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of graphData?.nodes ?? []) {
      const parts = node.path.split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        const candidate = parts.slice(i).join("/");
        if (!map.has(candidate)) map.set(candidate, node);
      }
    }
    return map;
  }, [graphData?.nodes]);

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
    const nodeIds = new Set((srcNodes as any[]).map((n) => n.id));

    const childToGroupForLayout = new Map<string, string>();
    if (currentNav.mode === "focus") {
      for (const n of displayNodes) {
        const nid = n.id as string;
        if (!nid.startsWith("group:") || !(n as any).memberIds) continue;
        for (const mid of (n as any).memberIds as string[]) childToGroupForLayout.set(mid, nid);
      }
    }

    const validEdges = srcEdges
      .map((e) => ({
        ...e,
        source: childToGroupForLayout.get(e.source) ?? e.source,
        target: childToGroupForLayout.get(e.target) ?? e.target,
      }))
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target) && e.source !== e.target)
      .filter((e, index, arr) => arr.findIndex((x) => x.source === e.source && x.target === e.target) === index);

    elkLayout(srcNodes, validEdges, dims, forcedAlgo)
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

  // Blast radius: BFS reverse from selected node (who imports this?)
  const blastIds = useMemo(() => {
    if (!selectedId || !graphData?.edges) return new Set<string>();
    const isFocus = currentNav.mode === "focus";
    if (isFocus) return new Set<string>(); // focus mode already dims non-related
    const visited = new Set<string>([selectedId]);
    const queue = [selectedId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of graphData.edges) {
        // edge.target === current means edge.source imports current
        if (edge.target === current && !visited.has(edge.source)) {
          visited.add(edge.source);
          queue.push(edge.source);
        }
      }
    }
    return visited;
  }, [selectedId, graphData, currentNav.mode]);

  const [flowNodes, setFlowNodes] = useState<Node[]>([]);

  const updateNodeInternals = useUpdateNodeInternals();

  // Update flow nodes when layout or display data changes
  useEffect(() => {
    if (!layoutMap) return;
    const hasActive = activeId !== null;
    const blastActive = blastIds.size > 1;
    const expandSet = expandedFolders;

    // Build child-to-group mapping from group nodes (id starts with "group:")
    const childToGroup = new Map<string, { groupId: string; index: number }>();
    for (const n of displayNodes) {
      const nid = n.id as string;
      if (nid.startsWith("group:") && (n as any).memberIds) {
        const members = (n as any).memberIds as string[];
        members.forEach((mid, i) => childToGroup.set(mid, { groupId: nid, index: i }));
      }
    }

    // Expand children: look up expanded group members from graphData.nodes
    const childrenData: any[] = [];
    if (graphData?.nodes) {
      const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));
      for (const [childId, { groupId }] of childToGroup) {
        if (expandSet.has(groupId)) {
          const childNode = nodeMap.get(childId);
          if (childNode) {
            childrenData.push({ ...childNode, fileCount: undefined, childGroupId: groupId } as any);
          }
        }
      }
    }

    const fileNodes: Node[] = displayNodes
      .filter((n) => {
        const nid = n.id as string;
        if (nid.startsWith("group:")) return layoutMap.has(nid);
        // Children come from childrenData, not displayNodes
        if (childToGroup.has(nid)) return false;
        return layoutMap.has(nid);
      })
      .map((n) => {
        const nid = n.id as string;
        const isBlastOrigin = nid === selectedId && blastActive;
        const isBlast = !isBlastOrigin && blastIds.has(nid);
        let className = undefined;
        if (isBlastOrigin) className = "codemap-node-blast-origin";
        else if (isBlast) className = "codemap-node-blast";
        else if (blastActive) className = "opacity-20";
        else if (matchedIds) className = matchedIds.has(nid) ? undefined : "opacity-20";
        else if (hasActive && !related.has(nid)) className = "opacity-30";

        // Group nodes: type "groupFolder"
        if (nid.startsWith("group:")) {
          const gd = n as any;
          const isExpanded = expandSet.has(nid);
          return {
            id: nid,
            type: "groupFolder",
            position: layoutMap.get(nid)!,
            style: { width: 300, height: isExpanded ? (gd.nodeHeight as number ?? GROUP_HEADER_H + (gd.childrenHeight as number || 0)) : GROUP_HEADER_H },
            data: {
              ...gd,
              expanded: isExpanded,
              focusMode: currentNav.mode === "focus",
              incomingSummaryCount: gd.incomingSummaryCount as number | undefined,
              outgoingSummaryCount: gd.outgoingSummaryCount as number | undefined,
              internalEdgeCount: gd.internalEdgeCount as number | undefined,
            },
            selected: nid === activeId,
            className,
          };
        }

        // Regular file/folder nodes
        return {
          id: nid,
          type: (nid.startsWith("folder:") || displayUseFolder) ? "folder" : "dependency",
          position: layoutMap.get(nid)!,
          data: { ...(n as unknown as Record<string, unknown>), treeMode: layoutAlgo === "mrtree" && currentNav.mode !== "focus", expanded: nid.startsWith("folder:") && expandSet.has(nid), focusMode: currentNav.mode === "focus" },
          selected: nid === activeId,
          className,
        };
      });

    // Add expanded children as dependency nodes with parentId/extent
    for (const cn of childrenData) {
      const info = childToGroup.get(cn.id as string);
      if (!info) continue;
      fileNodes.push({
        id: cn.id,
        type: "dependency",
        parentId: info.groupId,
        extent: "parent" as const,
        position: { x: 8, y: GROUP_HEADER_H + info.index * ROW_GAP },
        data: { ...(cn as unknown as Record<string, unknown>), treeMode: false, insideGroup: true },
        selected: cn.id === activeId,
        className: undefined,
      } satisfies Node);
    }

    setFlowNodes(fileNodes);

    // Auto-fitView when entering focus mode
    if (currentNav.mode === "focus" && currentNav.focusNodeId && lastFittedRef.current !== currentNav.focusNodeId) {
      lastFittedRef.current = currentNav.focusNodeId;
      setTimeout(() => fitView({ duration: 300, padding: 0.1 }), 80);
    }

    // Recalculate group bounds when expand state changes
    if (expandSet.size > 0) {
      const ids = [...expandSet];
      // Also include children IDs so React Flow recalculates their Handle positions
      for (const [childId, { groupId }] of childToGroup) {
        if (expandSet.has(groupId)) ids.push(childId);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateNodeInternals(ids);
        });
      });
    }
  }, [displayNodes, layoutMap, activeId, related, displayUseFolder, expandedFolders, currentNav, fitView, updateNodeInternals, matchedIds, blastIds]);

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
    window.addEventListener("codemap-group-toggle", handler);
    return () => window.removeEventListener("codemap-group-toggle", handler);
  }, [currentNav.focusNodeId]);

  // Node toolbar → focus on file
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent).detail as { id: string };
      pushNav({ mode: "focus", folder: currentNav.folder, focusNodeId: id });
      setSelectedId(id);
    };
    window.addEventListener("codemap-node-focus", handler);
    return () => window.removeEventListener("codemap-node-focus", handler);
  }, [currentNav.folder, pushNav]);

  useEffect(() => {
    if (!focusedPath || !graphData?.nodes?.length) return;

    const targetNode = graphData.nodes.find((node) => node.path === focusedPath) ?? graphNodeByNormalizedPath.get(focusedPath);

    if (!targetNode) {
      setFocusError(`File not present in graph: ${focusedPath}`);
      return;
    }

    setFocusError(null);
    if (currentNav.mode === "focus" && currentNav.focusNodeId === targetNode.id) return;
    pushNav({ mode: "focus", folder: currentNav.folder, focusNodeId: targetNode.id });
    setSelectedId(targetNode.id);
  }, [currentNav, focusedPath, graphData?.nodes, graphNodeByNormalizedPath]);

  // ⌘K / Ctrl+K → focus search input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(".codemap-search-input");
        input?.focus();
      }
      if (e.key === "Escape") {
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
      isBlast = false,
    ) => {
      if (isFaded) return { stroke: "var(--border)", strokeWidth: 0.5, opacity: 0.15 };
      if (isCycle) return { stroke: "#ef4444", strokeWidth: 1.5, opacity: 0.7 };
      const color = isBlast ? "#f59e0b" : isRel ? (directionOut ? "#a78bfa" : "#60a5fa") : "#94a3b8";
      const extra = isFocus && directionOut ? { strokeDasharray: "8 4" } : {};
      const w = isFocus && !directionOut ? 0.5 : isRel || isBlast ? 1.5 : 1;
      return { stroke: color, strokeWidth: w, opacity: isRel || isBlast ? 0.9 : 0.55, ...extra };
    };

    const mapEdge = (id: string, source: string, target: string): Edge => {
      const isCycleEdge = Boolean(
        (displayNodes.find((n) => n.id === source) as Record<string, unknown> | undefined)?.isInCycle &&
        (displayNodes.find((n) => n.id === target) as Record<string, unknown> | undefined)?.isInCycle,
      );
      const isBlastEdge = blastIds.size > 1 && blastIds.has(source) && blastIds.has(target);
      const isRelated = related.has(source) && related.has(target);
      const isFaded = blastIds.size > 1 ? !isBlastEdge : (activeId !== null && !isRelated);
      const directionOut = source === focusId;
      return {
        id,
        source,
        target,
        type: "focus",
        animated: !isFaded && !isCycleEdge,
        data: isFocus
          ? { flow: directionOut ? "outgoing" : "incoming", active: isRelated && selectedId !== null }
          : { mode: layoutAlgo === "mrtree" ? "mrtree" : "structure" },
        markerEnd: undefined,
        style: edgeStyle(isCycleEdge, isBlastEdge ? true : isRelated, isFaded, directionOut, isBlastEdge),
      };
    };

    return displayEdges.map(({ id, source, target }) => mapEdge(id, source, target));
  }, [displayEdges, related, displayNodes, currentNav, activeId, selectedId, layoutAlgo, blastIds, expandedFolders]);

  const FocusEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    data,
  }: EdgeProps<Edge<{ flow?: "incoming" | "outgoing"; active?: boolean; mode?: "structure" | "mrtree" }>>) => {
    const pathArgs = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
    const [edgePath] = getBezierPath(pathArgs);
    const isIncoming = data?.flow === "incoming";
    const isOutgoing = data?.flow === "outgoing";
    const isActive = data?.active === true;
    return (
      <>
        <BaseEdge id={id} path={edgePath} style={style} />
        {(!isIncoming && !isOutgoing) ? (
          <polygon points="0,-3 7,0 0,3" fill="#facc15" opacity={0.9}>
            <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} rotate="auto" />
          </polygon>
        ) : isIncoming ? (
          isActive ? (
            <polygon points="0,-4 9,0 0,4" fill="#3b82f6">
              <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} rotate="auto" />
            </polygon>
          ) : (
            <polygon points="0,-3 7,0 0,3" fill="#facc15" opacity={0.5} />
          )
        ) : isOutgoing ? (
          isActive ? (
            <polygon points="0,-4 9,0 0,4" fill="#a78bfa">
              <animateMotion dur="1.8s" repeatCount="indefinite" path={edgePath} rotate="auto" />
            </polygon>
          ) : (
            <polygon points="0,-3 7,0 0,3" fill="#a78bfa" opacity={0.4} />
          )
        ) : null}
      </>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeTypes = useMemo(() => ({
    dependency: DependencyNode as any,
    folder: FolderNode as any,
    groupFolder: GroupFolderNode as any,
  }), []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edgeTypes = useMemo(() => ({
    focus: FocusEdge as any,
  }), []);

  // Active node info from selectedId
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
      // File click in focus → re-focus
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
        setSelectedId(currentNav.focusNodeId ?? null);
        return;
      }
      // Group folder click in focus → expand/collapse
      if (node.type === "groupFolder" && currentNav.mode === "focus") {
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.has(node.id) ? next.delete(node.id) : next.add(node.id);
          return next;
        });
        setSelectedId(currentNav.focusNodeId ?? null);
        return;
      }
    },
    [currentNav, displayNodes, pushNav],
  );

  // Edge hover → show "src → tgt" label
  const onEdgeMouseEnter = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const srcNode = graphData?.nodes?.find((n) => n.id === edge.source);
      const tgtNode = graphData?.nodes?.find((n) => n.id === edge.target);
      const srcLabel = srcNode?.label ?? edge.source.split("/").pop() ?? edge.source;
      const tgtLabel = tgtNode?.label ?? edge.target.split("/").pop() ?? edge.target;
      const label = `imports: ${srcLabel} → ${tgtLabel}`;
      // Position at midpoint from edge event coordinates
      setHoveredEdgeLabel({ label, x: _event.clientX, y: _event.clientY });
    },
    [graphData],
  );
  const onEdgeMouseLeave = useCallback(() => setHoveredEdgeLabel(null), []);

  // Breadcrumb segments from navStack
  const breadcrumbs = useMemo(() => {
    const segs: { label: string; index: number }[] = [];
    segs.push({ label: "Graph", index: 0 });
    for (let i = 1; i < navStack.length; i++) {
      const nav = navStack[i];
      if (nav.mode === "structure" && nav.folder) {
        segs.push({ label: nav.folder.path.split("/").pop() ?? nav.folder.path, index: i });
      } else if (nav.mode === "focus" && nav.focusNodeId) {
        const node = graphData?.nodes?.find((n) => n.id === nav.focusNodeId);
        segs.push({ label: node?.label ?? nav.focusNodeId.split("/").pop() ?? nav.focusNodeId, index: i });
      }
    }
    return segs;
  }, [navStack, graphData]);

  return (
    <section className="flex-1 flex flex-row min-h-0 overflow-hidden" aria-label="Code map">
      <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden">
      <header className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <div key={`${crumb.index}:${crumb.label}`} className="inline-flex items-center gap-1">
                    {index > 0 && <span className="opacity-50">/</span>}
                    {isLast ? (
                      <span className="text-foreground">{crumb.label}</span>
                    ) : (
                      <button
                        className="hover:text-foreground px-1 py-0.5 rounded"
                        onClick={() => {
                          setNavStack((prev) => prev.slice(0, crumb.index + 1));
                          setSelectedId(null);
                          setLayoutMap(null);
                          setExpandedFolders(new Set());
                          setSearchQuery("");
                        }}
                      >
                        {crumb.label}
                      </button>
                    )}
                  </div>
                );
              })}
            </nav>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentNav.mode === "structure" && currentNav.folder
              ? currentNav.folder.path
              : currentNav.mode === "focus" && currentNav.focusNodeId
                ? (graphData?.nodes?.find((n) => n.id === currentNav.focusNodeId)?.path ?? currentNav.focusNodeId)
                : "Module relationships and change impact"}
          </p>
        </div>

        {blastIds.size > 1 && currentNav.mode !== "focus" && (
          <span className="codemap-blast-badge">💥 Blast: {blastIds.size - 1} files</span>
        )}

        <input
          type="text"
          className="codemap-search-input"
          placeholder="Search... ⌘K"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

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
          <>
            {focusError && (
              <div className="codemap-empty border-b border-border px-3 py-2 text-xs text-muted-foreground">
                {focusError}
              </div>
            )}
            <ReactFlow
              nodes={flowNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
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
              <MiniMap position="bottom-right" nodeColor="#3b82f6" maskColor="var(--background)/0.6" style={{ background: "var(--card)" }} />
              {hoveredEdgeLabel && (
                <EdgeLabelRenderer>
                  <div
                    className="codemap-edge-tooltip"
                    style={{ position: "absolute", left: hoveredEdgeLabel.x, top: hoveredEdgeLabel.y - 24, transform: "translate(-50%, -100%)" }}
                  >
                    {hoveredEdgeLabel.label}
                  </div>
                </EdgeLabelRenderer>
              )}
            </ReactFlow>
          </>
        )}
      </div>

      {/* Legend overlay — bottom-left corner of graph */}
      <div className="codemap-legend">
        <div className="codemap-legend-row">
          <svg width="14" height="10" className="shrink-0"><line x1="0" y1="5" x2="14" y2="5" stroke="#94a3b8" strokeWidth="1.5" /></svg>
          Dependency
        </div>
        <div className="codemap-legend-row">
          <svg width="14" height="10" className="shrink-0"><polygon points="0,1 10,5 0,9" fill="#facc15" opacity={0.9} /></svg>
          Data flow
        </div>
        {currentNav.mode === "focus" && <>
          <div className="codemap-legend-row">
            <svg width="14" height="10" className="shrink-0"><line x1="0" y1="5" x2="14" y2="5" stroke="#60a5fa" strokeWidth="0.5" /></svg>
            Imports this file
          </div>
          <div className="codemap-legend-row">
            <svg width="14" height="10" className="shrink-0"><line x1="0" y1="5" x2="14" y2="5" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
            This file imports
          </div>
        </>}
        {blastIds.size > 1 && currentNav.mode !== "focus" && (
          <div className="codemap-legend-row">
            <svg width="14" height="10" className="shrink-0"><line x1="0" y1="5" x2="14" y2="5" stroke="#f59e0b" strokeWidth="1.5" /></svg>
            Blast radius
          </div>
        )}
        <div className="codemap-legend-row">
          <svg width="14" height="10" className="shrink-0"><line x1="0" y1="5" x2="14" y2="5" stroke="#ef4444" strokeWidth="1.5" /></svg>
          Circular dep
        </div>
        <div className="codemap-legend-divider" />
        <div className="codemap-legend-row codemap-legend-hint">Click to select · Double-click to drill down</div>
      </div>

      </div> {/* end codemap-map-container */}
      </div> {/* end left column */}

      {/* Right inspector — docked, full height, scrollable */}
      {activeDetail && (
        <aside className="codemap-inspector">
          <div className="codemap-inspector-header">
            <div className="codemap-inspector-title-wrap">
              <span className="codemap-inspector-title">
                {graphData?.nodes?.find((n) => n.id === selectedId)?.label ?? selectedId}
              </span>
              {graphData?.nodes?.find((n) => n.id === selectedId)?.path && (
                <span className="codemap-inspector-path">
                  {graphData?.nodes?.find((n) => n.id === selectedId)?.path}
                </span>
              )}
            </div>
            <button className="codemap-inspector-close" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
          </div>
          <div className="codemap-inspector-body">
            <div className="codemap-detail-section">
              <h4 className="codemap-detail-heading">IMPORTS ({activeDetail.imports.length})</h4>
              {activeDetail.imports.length === 0 ? (
                <span className="codemap-detail-empty">None</span>
              ) : (
                <ul className="codemap-detail-list">
                  {activeDetail.imports.map((f) => (
                    <li key={f.id} className="codemap-detail-file" title={f.path}>{f.path}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="codemap-detail-section">
              <h4 className="codemap-detail-heading">IMPORTED BY ({activeDetail.importedBy.length})</h4>
              {activeDetail.importedBy.length === 0 ? (
                <span className="codemap-detail-empty">None</span>
              ) : (
                <ul className="codemap-detail-list">
                  {activeDetail.importedBy.map((f) => (
                    <li key={f.id} className="codemap-detail-file" title={f.path}>{f.path}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>
      )}
    </section>
  );
}
