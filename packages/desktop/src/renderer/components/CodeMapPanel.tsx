import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from "d3-force";
import type { GraphNode, GraphData } from "../../shared/ipc.js";

const COLORS: Record<GraphNode["category"], string> = {
  entry: "#ef8a48",
  core: "#6a8ee8",
  shared: "#a276d4",
  other: "#4aaa88",
};

function forceLayout(nodes: GraphNode[], edges: Array<[string, string]>): Array<GraphNode & { x: number; y: number; radius: number }> {
  if (nodes.length === 0) return [];

  const simNodes: Array<GraphNode & { id: string; x?: number; y?: number }> = nodes.map((n) => ({
    ...n,
    id: n.id,
  }));

  const simLinks = edges.map(([source, target]) => ({ source, target }));

  const sim = forceSimulation(simNodes)
    .force("link", forceLink(simLinks).id((d: any) => d.id).distance(220))
    .force("charge", forceManyBody().strength(-500))
    .force("center", forceCenter(0, 0))
    .force("collide", forceCollide(80))
    .stop();

  sim.tick(300);

  return simNodes.map((n: any) => ({
    ...n,
    x: n.x ?? 0,
    y: n.y ?? 0,
    radius: 30,
  }));
}

function relatedNodeIds(selectedId: string, edges: Array<[string, string]>) {
  const related = new Set([selectedId]);
  for (const [from, to] of edges) {
    if (from === selectedId) related.add(to);
    if (to === selectedId) related.add(from);
  }
  return related;
}

function DependencyNode({ data, selected }: { data: GraphNode; selected: boolean }) {
  const color = COLORS[data?.category ?? "other"] ?? COLORS.other;
  const label = data?.label ?? data?.path?.split("/").pop() ?? "?";
  const path = data?.path ?? "";
  return (
    <div
      className={`codemap-dependency-node${selected ? " selected" : ""}`}
      style={{ minWidth: 140, minHeight: 40 }}
    >
      <span className="codemap-dependency-node-dot" style={{ background: color, width: 8, height: 8, flexShrink: 0, borderRadius: "50%" }} />
      <div className="codemap-dependency-node-body" style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, overflow: "hidden" }}>
        <strong className="codemap-dependency-node-label" style={{ fontWeight: 600, fontSize: 12, color: "var(--foreground)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</strong>
        <span className="codemap-dependency-node-path" style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{path}</span>
      </div>
      <span className="codemap-dependency-node-stats" style={{ flexShrink: 0, fontSize: 10, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }} title={`${data?.inboundCount ?? 0} inbound · ${data?.outboundCount ?? 0} outbound`}>
        {data?.inboundCount ?? 0}↓ {data?.outboundCount ?? 0}↑
      </span>
    </div>
  );
}

export function CodeMapPanel() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    window.codemap
      .getGraphData()
      .then((data) => {
        setGraphData(data);
        if (data?.error) {
          setError(data.error);
        } else if (data && data.nodes.length > 0) {
          setSelectedId(data.nodes[0].id);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load graph");
      })
      .finally(() => setLoading(false));
  }, []);

  const layoutNodes = useMemo(
    () => forceLayout(graphData?.nodes ?? [], graphData?.edges ?? []),
    [graphData],
  );

  const edgesData = graphData?.edges ?? [];
  const activeId = selectedId ?? layoutNodes[0]?.id ?? null;
  const related = useMemo(
    () => (activeId ? relatedNodeIds(activeId, edgesData) : new Set<string>()),
    [activeId, edgesData],
  );

  const rfNodes = useMemo<Node[]>(
    () =>
      layoutNodes.map((n) => ({
        id: n.id,
        type: "dependency",
        position: { x: n.x, y: n.y },
        data: n as unknown as Record<string, unknown>,
        selected: n.id === activeId,
      })),
    [layoutNodes, activeId],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      edgesData.map(([source, target]) => ({
        id: `${source}-${target}`,
        source,
        target,
        style: related.has(source) && related.has(target)
          ? { stroke: "var(--foreground)", strokeWidth: 2, opacity: 0.6 }
          : { stroke: "var(--border-strong)", strokeWidth: 1, opacity: 0.35 },
      })),
    [edgesData, related],
  );

  const nodeTypes = useMemo(() => ({ dependency: DependencyNode }), []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedId(node.id);
    },
    [],
  );

  return (
    <section className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden" aria-label="Code map">
      <header className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Code map</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Module relationships and change impact</p>
        </div>
        <div className="codemap-view-switch" aria-label="Map view">
          <button className="active" type="button">Graph</button>
          <button type="button" title="Tree view is not available yet">Tree</button>
          <button type="button" title="Heat view is not available yet">Heat</button>
        </div>
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
        ) : layoutNodes.length === 0 ? (
          <div className="codemap-empty">
            <span>No project linked</span>
            <span className="codemap-empty-detail">Link a CodeMap project to see the dependency graph.</span>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodeOrigin={[0.5, 0.5]}
            panOnScroll
            selectionOnDrag
            deleteKeyCode={["Backspace", "Delete"]}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border-strong)" gap={20} size={1} />
            <Controls className="[&>button]:bg-card [&>button]:border-border [&>button]:text-muted-foreground [&>button]:rounded-md" />
          </ReactFlow>
        )}
      </div>
    </section>
  );
}
