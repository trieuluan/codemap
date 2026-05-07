import { Icon } from "./icon";
import { EditorLogos } from "./data";

interface GraphNode {
  id: string; x: number; y: number; r: number; label: string;
  kind: "module" | "file"; glow?: boolean;
}

const nodes: GraphNode[] = [
  { id: "core",    x: 400, y: 260, r: 28, label: "core/",       kind: "module", glow: true },
  { id: "auth",    x: 220, y: 150, r: 18, label: "auth",        kind: "module" },
  { id: "session", x: 130, y: 220, r: 12, label: "session.ts",  kind: "file" },
  { id: "guards",  x: 150, y:  90, r: 11, label: "guards.ts",   kind: "file" },
  { id: "api",     x: 600, y: 140, r: 18, label: "api",         kind: "module" },
  { id: "routes",  x: 700, y:  80, r: 11, label: "routes.ts",   kind: "file" },
  { id: "client",  x: 720, y: 200, r: 12, label: "client.ts",   kind: "file" },
  { id: "db",      x: 240, y: 400, r: 16, label: "db",          kind: "module" },
  { id: "schema",  x: 130, y: 380, r: 11, label: "schema.ts",   kind: "file" },
  { id: "migrate", x: 230, y: 470, r: 11, label: "migrations",  kind: "file" },
  { id: "ui",      x: 580, y: 380, r: 16, label: "ui",          kind: "module" },
  { id: "comp",    x: 690, y: 430, r: 12, label: "components",  kind: "file" },
  { id: "hooks",   x: 660, y: 320, r: 11, label: "hooks.ts",    kind: "file" },
];

const edges: [string, string][] = [
  ["auth", "core"], ["auth", "session"], ["auth", "guards"],
  ["api", "core"], ["api", "routes"], ["api", "client"],
  ["db", "core"], ["db", "schema"], ["db", "migrate"],
  ["ui", "core"], ["ui", "comp"], ["ui", "hooks"],
  ["api", "auth"], ["ui", "api"], ["api", "db"],
];

function findNode(id: string): GraphNode {
  const n = nodes.find(n => n.id === id);
  if (!n) throw new Error(`Missing node: ${id}`);
  return n;
}

function HeroGraph() {
  return (
    <div className="relative w-full">
      <svg viewBox="0 0 800 520" className="w-full h-auto">
        <defs>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0.7"/>
            <stop offset="60%"  stopColor="#5dd6e0" stopOpacity="0.15"/>
            <stop offset="100%" stopColor="#5dd6e0" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#5dd6e0" stopOpacity="0.1"/>
            <stop offset="50%"  stopColor="#a78bfa" stopOpacity="0.45"/>
            <stop offset="100%" stopColor="#5dd6e0" stopOpacity="0.1"/>
          </linearGradient>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <circle cx={400} cy={260} r={160} fill="url(#nodeGlow)" />

        {edges.map(([a, b], i) => {
          const A = findNode(a), B = findNode(b);
          const dashed = i % 3 === 0;
          return (
            <line
              key={i}
              x1={A.x} y1={A.y} x2={B.x} y2={B.y}
              stroke={dashed ? "rgba(167, 139, 250, 0.45)" : "url(#edgeGrad)"}
              strokeWidth={1}
              className={dashed ? "edge-dash" : ""}
            />
          );
        })}

        {nodes.map((n) => (
          <g key={n.id} className={n.kind === "module" ? "" : "node-pulse"}>
            <circle cx={n.x} cy={n.y} r={n.r + 4}
                    fill={n.glow ? "rgba(167, 139, 250, 0.18)" : "rgba(255,255,255,0.02)"} />
            <circle cx={n.x} cy={n.y} r={n.r}
                    fill={n.kind === "module" ? "#0e1014" : "#15171c"}
                    stroke={n.glow ? "#a78bfa" : n.kind === "module" ? "#5dd6e0" : "#3a4150"}
                    strokeWidth={1.2}
                    filter={n.glow ? "url(#softGlow)" : undefined} />
            {n.kind === "module" && (
              <text x={n.x} y={n.y + 4} textAnchor="middle"
                    fontFamily="Geist Mono" fontSize={11} fill="#d6dae3">
                {n.label}
              </text>
            )}
          </g>
        ))}

        {nodes.filter(n => n.kind === "file").map(n => (
          <text key={n.id + "-l"}
                x={n.x} y={n.y - n.r - 6}
                textAnchor="middle"
                fontFamily="Geist Mono" fontSize={10} fill="#5b6478">
            {n.label}
          </text>
        ))}
      </svg>

      <div className="absolute inset-0 pointer-events-none">
        <AgentChip cls="absolute left-[6%] top-[8%] float-slow"     name="Claude Code" emoji="◆" />
        <AgentChip cls="absolute right-[8%] top-[18%] float-mid"    name="Cursor"      emoji="▲" />
        <AgentChip cls="absolute right-[3%] bottom-[12%] float-slow" name="Codex"      emoji="●" />
        <AgentChip cls="absolute left-[2%] bottom-[18%] float-fast" name="Gemini CLI"  emoji="✦" />
      </div>
    </div>
  );
}

function AgentChip({ cls, name, emoji }: { cls: string; name: string; emoji: string }) {
  return (
    <div className={`pointer-events-auto ${cls}`}>
      <div className="glass ring-glow rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="text-accent-cyan text-sm">{emoji}</span>
        <span className="font-mono text-[11px] tracking-wide text-ink-50">{name}</span>
        <span className="size-1.5 rounded-full bg-accent-emerald shadow-[0_0_8px_#5fd1a3]" />
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative pt-14 pb-20 overflow-hidden">
      <div className="absolute inset-0 grid-bg" aria-hidden />
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(124,135,255,0.18), transparent 70%)" }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center text-center">
          <span className="chip mb-6">
            <span className="dot" />
            MCP-native code intelligence
            <span className="text-ink-200">·</span>
            <span className="text-ink-50">now in beta</span>
          </span>

          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight max-w-4xl gradient-text leading-[1.02]">
            Make AI coding agents
            <br />
            <span className="accent-text">understand your architecture.</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-ink-100 max-w-2xl leading-relaxed">
            CodeMap is the semantic layer between your repository and AI coding agents — symbol-level
            indexing, dependency graphs, and MCP tools that give Claude, Cursor, Codex and Gemini real
            architectural memory.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <a href="/auth/signup" className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium">
              Get started free
              <Icon name="arrow-right" size={15} />
            </a>
            <a href="#how" className="btn-ghost inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium font-mono text-sm">
              <Icon name="terminal" size={14} />
              <span>See how it works</span>
            </a>
          </div>

          <div className="mt-5 flex items-center gap-5 text-xs font-mono text-ink-200">
            <span className="inline-flex items-center gap-1.5"><Icon name="check" size={12} className="text-accent-emerald" /> Local-first</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" size={12} className="text-accent-emerald" /> No source upload</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="check" size={12} className="text-accent-emerald" /> Open MCP spec</span>
          </div>
        </div>

        <div className="relative mt-16 mx-auto max-w-5xl">
          <div className="absolute inset-0 -z-10 blur-3xl opacity-60"
               style={{ background: "radial-gradient(closest-side, rgba(124,135,255,0.18), transparent 70%)" }} />
          <div className="card ring-glow p-4 md:p-8 relative overflow-hidden">
            <div className="flex items-center justify-between text-[11px] font-mono text-ink-200 mb-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent-emerald" /> indexed</span>
                <span>·</span><span>4,182 files</span>
                <span>·</span><span>61,204 symbols</span>
                <span>·</span><span>18,937 edges</span>
              </div>
              <div className="hidden md:flex items-center gap-3">
                <span>main</span><span>·</span><span>HEAD@a3f29b1</span>
              </div>
            </div>
            <HeroGraph />
          </div>
        </div>

        <div className="mt-12">
          <p className="text-center text-[11px] uppercase tracking-[0.2em] font-mono text-ink-200">
            Connects to AI coding tools you already use
          </p>
          <div className="mt-5 overflow-hidden">
            <div className="marquee-track flex gap-12 whitespace-nowrap">
              {[...EditorLogos, ...EditorLogos].map((e, i) => (
                <div key={i} className="flex items-center gap-2.5 text-ink-100">
                  <span className="text-accent-cyan/80">{e.glyph}</span>
                  <span className="font-medium">{e.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
