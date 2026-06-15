import { useMemo, useState } from "react";

type CategoryKey = "entry" | "core" | "shared" | "ui";

type MapNode = {
  id: string;
  label: string;
  detail: string;
  category: CategoryKey;
  x: number;
  y: number;
  radius: number;
  health: number;
};

const nodes: MapNode[] = [
  { id: "app", label: "App", detail: "src/App.tsx", category: "entry", x: 470, y: 64, radius: 31, health: 92 },
  { id: "router", label: "Router", detail: "src/router.ts", category: "core", x: 305, y: 150, radius: 28, health: 86 },
  { id: "workspace", label: "Workspace", detail: "src/workspace/index.ts", category: "core", x: 470, y: 176, radius: 34, health: 78 },
  { id: "session", label: "Session", detail: "src/session/store.ts", category: "shared", x: 635, y: 150, radius: 29, health: 81 },
  { id: "chat", label: "Chat", detail: "src/chat/ChatView.tsx", category: "ui", x: 260, y: 292, radius: 31, health: 88 },
  { id: "map", label: "Map", detail: "src/map/CodeMap.tsx", category: "ui", x: 430, y: 310, radius: 34, health: 74 },
  { id: "tools", label: "Tools", detail: "src/tools/index.ts", category: "shared", x: 610, y: 288, radius: 31, health: 69 },
  { id: "settings", label: "Settings", detail: "src/settings/Settings.tsx", category: "ui", x: 755, y: 268, radius: 28, health: 91 },
  { id: "api", label: "API", detail: "src/api/client.ts", category: "shared", x: 560, y: 412, radius: 30, health: 83 },
  { id: "storage", label: "Storage", detail: "src/storage/index.ts", category: "core", x: 730, y: 400, radius: 29, health: 72 },
];

const edges: Array<[string, string]> = [
  ["app", "router"], ["app", "workspace"], ["app", "session"],
  ["router", "chat"], ["router", "map"], ["workspace", "chat"],
  ["workspace", "map"], ["workspace", "tools"], ["session", "tools"],
  ["session", "settings"], ["map", "api"], ["tools", "api"],
  ["tools", "storage"], ["settings", "storage"], ["api", "storage"],
];

const colors: Record<CategoryKey, string> = {
  entry: "#ef8a48",
  core: "#6a8ee8",
  shared: "#a276d4",
  ui: "#4aaa88",
};

function relatedNodeIds(selectedId: string) {
  const related = new Set([selectedId]);
  for (const [from, to] of edges) {
    if (from === selectedId) related.add(to);
    if (to === selectedId) related.add(from);
  }
  return related;
}

export function CodeMapPanel() {
  const [selectedId, setSelectedId] = useState("map");
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const related = useMemo(() => relatedNodeIds(selectedId), [selectedId]);

  return (
    <section className="flex flex-col min-h-0 p-4 overflow-y-auto" aria-label="Code map">
      <header className="flex items-start justify-between gap-3 mb-4">
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

      <div className="flex flex-col gap-3 h-full min-h-0">
        <svg className="flex-1 min-h-[200px] border border-border rounded-[10px] bg-card" viewBox="150 10 700 470" role="img" aria-label="Dependency graph">
          <defs>
            <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity=".12" />
            </filter>
          </defs>
          {edges.map(([fromId, toId]) => {
            const from = nodes.find((node) => node.id === fromId)!;
            const to = nodes.find((node) => node.id === toId)!;
            const highlighted = related.has(fromId) && related.has(toId);
            return (
              <line
                className={highlighted ? "codemap-edge highlighted" : "codemap-edge"}
                key={`${fromId}-${toId}`}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
              />
            );
          })}
          {nodes.map((node) => {
            const selectedNode = node.id === selectedId;
            const dimmed = !related.has(node.id);
            return (
              <g
                className={`codemap-node${selectedNode ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
                key={node.id}
                onClick={() => setSelectedId(node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setSelectedId(node.id);
                }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  fill={colors[node.category]}
                  filter="url(#node-shadow)"
                  r={node.radius}
                />
                <text className="codemap-node-label" x={node.x} y={node.y + 4}>{node.label}</text>
              </g>
            );
          })}
        </svg>

        <div className="codemap-legend" aria-label="Map legend">
          {Object.entries(colors).map(([category, color]) => (
            <span key={category}><i style={{ background: color }} />{category}</span>
          ))}
        </div>
      </div>

      <footer className="codemap-detail">
        <div className="codemap-detail-main">
          <span className="codemap-detail-dot" style={{ background: colors[selected.category] }} />
          <div><strong>{selected.label}</strong><span>{selected.detail}</span></div>
        </div>
        <div className="codemap-health">
          <span>Health</span>
          <strong>{selected.health}</strong>
          <div><i style={{ width: `${selected.health}%` }} /></div>
        </div>
        <div className="codemap-impact">
          <span>Blast radius</span>
          <strong>{related.size - 1} direct modules</strong>
        </div>
      </footer>
    </section>
  );
}
