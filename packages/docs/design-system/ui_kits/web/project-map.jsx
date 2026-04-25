// Project map — 3-column code explorer per .claude/rules/ui-map.md.
// Filter sidebar (320) | file viewer (flex) | detail panel (320). h-[760].

const TREE = [
  { name: "packages", kind: "dir", children: [
    { name: "api", kind: "dir", children: [
      { name: "src", kind: "dir", children: [
        { name: "server.ts", kind: "file", lang: "ts" },
        { name: "app.ts", kind: "file", lang: "ts" },
      ]},
    ]},
    { name: "web", kind: "dir", expanded: true, children: [
      { name: "app", kind: "dir", expanded: true, children: [
        { name: "layout.tsx", kind: "file", lang: "tsx" },
        { name: "globals.css", kind: "file", lang: "css" },
        { name: "page.tsx", kind: "file", lang: "tsx" },
      ]},
      { name: "features", kind: "dir", children: [
        { name: "projects/map", kind: "dir" },
      ]},
      { name: "components/ui", kind: "dir" },
    ]},
    { name: "shared", kind: "dir" },
  ]},
];

function TreeNode({ node, depth = 0, selected, onSelect }) {
  const [open, setOpen] = React.useState(node.expanded || false);
  const isDir = node.kind === "dir";
  const isSelected = selected === node.name;
  const [hover, setHover] = React.useState(false);
  return (
    <div>
      <div
        onClick={() => isDir ? setOpen(!open) : onSelect(node)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 8px", paddingLeft: 8 + depth * 14,
          fontSize: 13, fontFamily: "var(--font-mono)", cursor: "pointer",
          background: isSelected ? "var(--sidebar-accent)" : hover ? "var(--sidebar-accent)" : "transparent",
          color: isSelected ? "var(--foreground)" : "var(--foreground)",
          borderRadius: 4,
        }}
      >
        {isDir ? (
          <Icon name={open ? "chevron-down" : "chevron-right"} size={12} style={{ color: "var(--muted-foreground)" }} />
        ) : <span style={{ width: 12 }} />}
        <Icon name={isDir ? (open ? "folder-open" : "folder") : "file"} size={12} style={{ color: "var(--muted-foreground)" }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
      </div>
      {isDir && open && node.children && node.children.map(c => (
        <TreeNode key={c.name} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

const SAMPLE_CODE = `import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "CodeMap", template: "%s | CodeMap" },
  description: "Map, analyze, and understand your codebase with CodeMap",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}`;

function tintLine(line) {
  // crude TS/JSX syntax tint
  return line
    .replace(/(import|export|const|default|function|return|from|type)\b/g, '<span style="color:oklch(0.65 0.18 250)">$1</span>')
    .replace(/("[^"]*"|'[^']*')/g, '<span style="color:oklch(0.7 0.15 145)">$1</span>')
    .replace(/(\/\/.*$)/g, '<span style="color:var(--muted-foreground)">$1</span>')
    .replace(/(\{|\}|\(|\)|;|,|=)/g, '<span style="color:var(--muted-foreground)">$1</span>');
}

function ProjectMap({ project, onNavigate }) {
  const p = project || { name: "codemap-web", id: "codemap-web", repo: "trieuluan/codemap", branch: "master" };
  const [tab, setTab] = React.useState("mapping");
  const [selected, setSelected] = React.useState({ name: "layout.tsx", lang: "tsx", path: "packages/web/app/layout.tsx" });
  const [detailTab, setDetailTab] = React.useState("details");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 4 }}>
            <span style={{ cursor: "pointer" }} onClick={() => onNavigate({ route: "/projects" })}>Projects</span>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ cursor: "pointer" }} onClick={() => onNavigate({ route: "/projects/" + p.id, project: p })}>{p.name}</span>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: "var(--foreground)" }}>map</span>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>Code map</h2>
        </div>
        <Button variant="outline" size="sm"><Icon name="search" size={14} />Search files
          <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", marginLeft: 4, padding: "1px 4px", border: "1px solid var(--border)", borderRadius: 4 }}>⌘K</kbd>
        </Button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {[
          { id: "mapping", label: "Mapping", icon: "list-tree" },
          { id: "insights", label: "Insights", icon: "bar-chart-3" },
          { id: "graph", label: "Graph", icon: "git-graph" },
        ].map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 14px", display: "flex", alignItems: "center", gap: 6,
            fontSize: 14, fontWeight: 500, cursor: "pointer",
            color: tab === t.id ? "var(--foreground)" : "var(--muted-foreground)",
            borderBottom: tab === t.id ? "2px solid var(--foreground)" : "2px solid transparent",
            marginBottom: -1,
          }}>
            <Icon name={t.icon} size={14} />{t.label}
          </div>
        ))}
      </div>

      {/* Status banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid color-mix(in oklch, oklch(0.7 0.15 145) 30%, var(--border))", background: "color-mix(in oklch, oklch(0.7 0.15 145) 6%, transparent)", borderRadius: 10 }}>
        <StatusDot tone="success" />
        <span style={{ fontSize: 13 }}>Snapshot ready — <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>248 files · 1m 44s · 2 hours ago</span></span>
        <Button variant="ghost" size="sm" style={{ marginLeft: "auto" }}><Icon name="rotate-cw" size={13} />Re-import</Button>
      </div>

      {tab === "mapping" && <MappingView selected={selected} setSelected={setSelected} detailTab={detailTab} setDetailTab={setDetailTab} />}
      {tab === "insights" && <InsightsView />}
      {tab === "graph" && <GraphView />}
    </div>
  );
}

function MappingView({ selected, setSelected, detailTab, setDetailTab }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr 320px", gap: 16, height: 720 }}>
      {/* Left: filter tree */}
      <Card style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid var(--border)" }}>
          <Input placeholder="Filter files…" style={{ background: "var(--secondary)" }} />
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="outline" size="sm" style={{ flex: 1 }}><Icon name="filter" size={12} />Kind</Button>
            <Button variant="outline" size="sm" style={{ flex: 1 }}><Icon name="code-2" size={12} />TypeScript</Button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {TREE.map(n => <TreeNode key={n.name} node={n} selected={selected.name} onSelect={(node) => setSelected({ ...node, path: "packages/web/app/" + node.name })} />)}
        </div>
      </Card>

      {/* Center: file viewer */}
      <Card style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon name="file" size={14} style={{ color: "var(--muted-foreground)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{selected.path}</span>
          <Badge variant="secondary">.{selected.lang}</Badge>
          <Badge variant="outline">component</Badge>
          <Badge variant="outline">text/typescript</Badge>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)", marginLeft: "auto" }}>1.4 KB · 36 lines</span>
        </div>
        <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--muted-foreground)", borderBottom: "1px solid var(--border)" }}>Read-only code viewer</div>
        <div style={{ flex: 1, overflow: "auto", padding: 16, display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 16px", fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.6 }}>
          {SAMPLE_CODE.split("\n").map((line, i) => (
            <React.Fragment key={i}>
              <span style={{ color: "var(--muted-foreground)", textAlign: "right", userSelect: "none" }}>{i + 1}</span>
              <span dangerouslySetInnerHTML={{ __html: tintLine(line) || "&nbsp;" }} />
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Right: detail panel */}
      <Card style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
          {[
            { id: "details", label: "Details" },
            { id: "rel", label: "Relations" },
            { id: "anal", label: "Analysis" },
          ].map(t => (
            <div key={t.id} onClick={() => setDetailTab(t.id)} style={{
              flex: 1, padding: "10px 8px", textAlign: "center", cursor: "pointer",
              fontSize: 13, fontWeight: 500,
              color: detailTab === t.id ? "var(--foreground)" : "var(--muted-foreground)",
              borderBottom: detailTab === t.id ? "2px solid var(--foreground)" : "2px solid transparent",
              marginBottom: -1,
            }}>{t.label}</div>
          ))}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {detailTab === "details" && <>
            <PanelGroup title="Classification">
              <PanelRow label="Kind" value="component" />
              <PanelRow label="Language" value="TypeScript" />
              <PanelRow label="MIME" value="text/typescript" mono />
            </PanelGroup>
            <PanelGroup title="Technical">
              <PanelRow label="Size" value="1.4 KB" mono />
              <PanelRow label="Lines" value="36" mono />
              <PanelRow label="SHA" value="9f3c2…a1" mono />
            </PanelGroup>
            <PanelGroup title="Repository path">
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)", wordBreak: "break-all" }}>
                packages/web/app/{selected.name}
              </div>
            </PanelGroup>
          </>}
          {detailTab === "rel" && <>
            <PanelGroup title="Imports (5)">
              <RelRow path="next/font/google" />
              <RelRow path="@vercel/analytics/next" />
              <RelRow path="@/components/theme-provider" />
              <RelRow path="@/components/ui/toaster" />
              <RelRow path="./globals.css" />
            </PanelGroup>
            <PanelGroup title="Imported by (2)">
              <RelRow path="app/(auth)/layout.tsx" />
              <RelRow path="app/(protected)/layout.tsx" />
            </PanelGroup>
          </>}
          {detailTab === "anal" && <>
            <PanelGroup title="Totals">
              <PanelRow label="Imports" value="5" mono />
              <PanelRow label="Symbols" value="2" mono />
              <PanelRow label="Exports" value="1" mono />
            </PanelGroup>
            <PanelGroup title="Top files by deps">
              <RelRow path="app/page.tsx" meta="14 imports" />
              <RelRow path="features/projects/map/explorer/project-map-shell.tsx" meta="11 imports" />
              <RelRow path="features/dashboard/header.tsx" meta="9 imports" />
            </PanelGroup>
          </>}
        </div>
      </Card>
    </div>
  );
}

function PanelGroup({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}
function PanelRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ fontFamily: mono ? "var(--font-mono)" : "inherit" }}>{value}</span>
    </div>
  );
}
function RelRow({ path, meta }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 6, background: "var(--secondary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
      {meta && <span style={{ color: "var(--muted-foreground)", fontSize: 11, marginLeft: 8, flexShrink: 0 }}>{meta}</span>}
    </div>
  );
}

function InsightsView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {[
          { label: "Total files", value: "248" },
          { label: "Languages", value: "4" },
          { label: "Orphan files", value: "12" },
          { label: "Cycle candidates", value: "2" },
        ].map(s => (
          <Card key={s.label}><div style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>{s.value}</div>
          </div></Card>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <CardHeader><CardTitle>Top files by inbound deps</CardTitle></CardHeader>
          <CardContent style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { p: "lib/utils.ts", n: 47 },
              { p: "components/ui/button.tsx", n: 32 },
              { p: "components/ui/card.tsx", n: 21 },
              { p: "lib/auth-client.ts", n: 18 },
              { p: "components/logo.tsx", n: 9 },
            ].map(r => (
              <div key={r.p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 13 }}>
                <span>{r.p}</span>
                <Badge variant="secondary">{r.n} ←</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Folder breakdown</CardTitle></CardHeader>
          <CardContent style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { p: "packages/web", n: 142, pct: 0.57 },
              { p: "packages/api", n: 78, pct: 0.31 },
              { p: "packages/shared", n: 18, pct: 0.07 },
              { p: "packages/mcp-server", n: 10, pct: 0.04 },
            ].map(r => (
              <div key={r.p}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{r.p}</span>
                  <span style={{ color: "var(--muted-foreground)" }}>{r.n}</span>
                </div>
                <div style={{ height: 6, background: "var(--secondary)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${r.pct * 100}%`, height: "100%", background: "var(--foreground)", opacity: 0.8 }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GraphView() {
  // Static schematic — not a real graph engine
  return (
    <Card style={{ height: 600, display: "flex" }}>
      <div style={{ width: 240, padding: 16, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Filter</div>
          <Input placeholder="Search nodes…" style={{ background: "var(--secondary)" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Language</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" defaultChecked /> TypeScript</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" defaultChecked /> CSS</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" /> SQL</label>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Folder focus</div>
          <Input placeholder="packages/web/features" style={{ background: "var(--secondary)" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" /> Cycles only
        </label>
      </div>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg viewBox="0 0 800 600" style={{ width: "100%", height: "100%" }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeWidth="1"/>
            </pattern>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="var(--muted-foreground)"/>
            </marker>
          </defs>
          <rect width="800" height="600" fill="url(#grid)"/>
          {/* Edges */}
          {[
            ["a","b"], ["a","c"], ["b","d"], ["c","d"], ["c","e"], ["d","f"], ["e","f"], ["b","g"], ["g","h"],
          ].map(([a,b], i) => {
            const pos = { a:[160,200], b:[340,140], c:[340,260], d:[520,200], e:[520,340], f:[680,260], g:[200,400], h:[380,460] };
            const [x1,y1] = pos[a], [x2,y2] = pos[b];
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted-foreground)" strokeWidth="1.5" markerEnd="url(#arrow)"/>;
          })}
          {[
            { id:"a", x:160, y:200, label:"layout.tsx" },
            { id:"b", x:340, y:140, label:"theme-provider" },
            { id:"c", x:340, y:260, label:"globals.css" },
            { id:"d", x:520, y:200, label:"sidebar.tsx" },
            { id:"e", x:520, y:340, label:"button.tsx" },
            { id:"f", x:680, y:260, label:"utils.ts", cycle:true },
            { id:"g", x:200, y:400, label:"page.tsx" },
            { id:"h", x:380, y:460, label:"logo.tsx" },
          ].map(n => (
            <g key={n.id} transform={`translate(${n.x - 60} ${n.y - 18})`}>
              <rect width="120" height="36" rx="8" fill="var(--card)" stroke={n.cycle ? "oklch(0.78 0.15 75)" : "var(--border)"} strokeWidth={n.cycle ? "2" : "1"}/>
              <text x="12" y="22" fill="var(--foreground)" fontFamily="var(--font-mono)" fontSize="11">{n.label}</text>
              <circle cx="108" cy="18" r="3" fill="oklch(0.65 0.18 250)"/>
            </g>
          ))}
        </svg>
        <div style={{ position: "absolute", bottom: 12, right: 12, display: "flex", gap: 6 }}>
          <Button variant="outline" size="icon-sm"><Icon name="plus" size={14}/></Button>
          <Button variant="outline" size="icon-sm"><Icon name="minus" size={14}/></Button>
          <Button variant="outline" size="icon-sm"><Icon name="maximize" size={14}/></Button>
        </div>
        <div style={{ position: "absolute", bottom: 12, left: 12, padding: 6, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
          8 nodes · 9 edges · 1 cycle
        </div>
      </div>
    </Card>
  );
}

Object.assign(window, { ProjectMap });
