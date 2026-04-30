"use client";

import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import type { ProjectSymbolGraphResponse } from "@/features/projects/api";

function symbolNodeLabel(
  node: ProjectSymbolGraphResponse["nodes"][number],
) {
  const isFileNode = node.kind === "file";
  return (
    <div className="min-w-0 text-left">
      <p className="truncate font-mono text-xs font-semibold">{node.name}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
        {isFileNode ? "file importer" : node.kind}
      </p>
      {node.signature ? (
        <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground/70">
          {node.signature}
        </p>
      ) : null}
    </div>
  );
}

function buildSymbolFlow(graph: ProjectSymbolGraphResponse): {
  nodes: Node[];
  edges: Edge[];
} {
  const incoming = graph.nodes.filter((node) => node.role === "incoming");
  const target = graph.nodes.find((node) => node.role === "target");
  const outgoing = graph.nodes.filter((node) => node.role === "outgoing");
  const yStep = 96;
  const nodeWidth = 260;

  const nodes: Node[] = [];

  incoming.forEach((node, index) => {
    const isFileImporter = node.kind === "file";
    nodes.push({
      id: node.id,
      type: "default",
      position: { x: 0, y: index * yStep },
      data: { label: symbolNodeLabel(node) },
      style: {
        width: nodeWidth,
        borderColor: isFileImporter
          ? "rgb(168 85 247 / 0.55)"   // purple for file importers
          : "rgb(251 146 60 / 0.55)",  // orange for symbol callers
        background: isFileImporter
          ? "rgb(168 85 247 / 0.06)"
          : "rgb(251 146 60 / 0.06)",
      },
    });
  });

  if (target) {
    nodes.push({
      id: target.id,
      type: "default",
      position: {
        x: 360,
        y: Math.max(incoming.length, outgoing.length, 1) * yStep * 0.35,
      },
      data: { label: symbolNodeLabel(target) },
      style: {
        width: nodeWidth,
        borderColor: "hsl(var(--primary))",
        background: "hsl(var(--primary) / 0.08)",
      },
    });
  }

  outgoing.forEach((node, index) => {
    nodes.push({
      id: node.id,
      type: "default",
      position: { x: 720, y: index * yStep },
      data: { label: symbolNodeLabel(node) },
      style: {
        width: nodeWidth,
        borderColor: "rgb(56 189 248 / 0.55)",
        background: "rgb(56 189 248 / 0.06)",
      },
    });
  });

  const edges = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    label: edge.kind.replace(/_/g, " "),
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color:
        edge.confidence === "potential"
          ? "rgb(148 163 184 / 0.75)"
          : "rgb(59 130 246 / 0.75)",
    },
    style: {
      stroke:
        edge.confidence === "potential"
          ? "rgb(148 163 184 / 0.55)"
          : "rgb(59 130 246 / 0.55)",
      strokeWidth: edge.confidence === "potential" ? 1.2 : 1.8,
      strokeDasharray: edge.confidence === "potential" ? "6 5" : undefined,
    },
  }));

  return { nodes, edges };
}

export function SymbolGraphCanvas({
  graph,
}: {
  projectId: string;
  filePath: string;
  graph: ProjectSymbolGraphResponse | null | undefined;
}) {
  if (!graph?.target) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-border/70 bg-card p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Symbol graph unavailable
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          The selected symbol was not found in the latest semantic index.
        </p>
      </div>
    );
  }

  const flow = buildSymbolFlow(graph);

  return (
    <div className="relative flex-1 overflow-hidden rounded-lg border border-border/70 bg-card">
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="rgb(148 163 184 / 0.15)" />
        <Controls showInteractive={false} />
        <MiniMap maskColor="rgb(0 0 0 / 0.04)" pannable zoomable />
      </ReactFlow>
    </div>
  );
}
