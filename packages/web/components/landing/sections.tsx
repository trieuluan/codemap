"use client";

import * as React from "react";
import { Icon } from "./icon";
import {
  pipelineSteps,
  mcpTools,
  workflowSteps,
  editorIntegrations,
  features,
  plans,
  type McpTool,
} from "./data";

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ eyebrow, title, sub }: { eyebrow?: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className="max-w-3xl">
      {eyebrow && (
        <div className="chip mb-5">
          <span className="dot" />{eyebrow}
        </div>
      )}
      <h2 className="text-3xl md:text-5xl font-semibold tracking-tight gradient-text leading-[1.05]">{title}</h2>
      {sub && <p className="mt-4 text-base md:text-lg text-ink-100 leading-relaxed max-w-2xl">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Problem
// ---------------------------------------------------------------------------

const fails = [
  { l: "Hallucinated edits",       r: "“Editing a function that doesn’t exist anymore.”" },
  { l: "Wrong files",               r: "Patches the duplicate at /old/utils, not /core/utils." },
  { l: "Broken imports",            r: "Adds an import path that was renamed two refactors ago." },
  { l: "No architectural memory",   r: "Re-derives module structure on every prompt." },
  { l: "Repeated context loading",  r: "Re-reads the same 30 files, every session, forever." },
  { l: "Lost in large repos",       r: "Confidently asserts behavior of code it never opened." },
];
const wins = [
  { l: "Symbol-level grounding",  r: "Functions, types and call sites resolved before edit." },
  { l: "Architectural map",       r: "Module graph kept fresh — no rediscovery per prompt." },
  { l: "Stale-context hooks",     r: "Reimports automatically after writes; refuses on drift." },
  { l: "Blast radius preview",    r: "Lists every caller, type and test hit by a change." },
  { l: "MCP-native tools",        r: "search_codebase, find_usages, get_symbol_context — first class." },
  { l: "Cross-repo reasoning",    r: "Works across monorepos, packages and external deps." },
];

export function Problem() {
  return (
    <section id="problem" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow="The problem"
          title="AI agents are confident. They are not informed."
          sub="Generic AI coding tools treat your repository as a search engine — they grep, they guess, and they hallucinate. CodeMap gives them an actual map of the territory."
        />

        <div className="mt-14 grid md:grid-cols-2 gap-5">
          <div className="card relative overflow-hidden">
            <div className="hairline-b px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-accent-rose/80 shadow-[0_0_10px_#ff7a8a]" />
                <span className="font-mono text-xs uppercase tracking-wider text-ink-100">without codemap</span>
              </div>
              <span className="text-[11px] font-mono text-ink-200">grep + vibes</span>
            </div>
            <ul className="px-6 py-5 divide-y divide-white/5">
              {fails.map((f, i) => (
                <li key={i} className="py-3 grid grid-cols-[18px_1fr] gap-3 items-start">
                  <Icon name="x" size={14} className="text-accent-rose mt-1" />
                  <div>
                    <div className="text-ink-50 text-sm font-medium">{f.l}</div>
                    <div className="text-ink-200 text-sm">{f.r}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card ring-glow relative overflow-hidden">
            <div className="absolute -top-24 right-0 w-72 h-72 rounded-full pointer-events-none"
                 style={{ background: "radial-gradient(closest-side, rgba(93,214,224,0.18), transparent 70%)" }} />
            <div className="hairline-b px-6 py-4 flex items-center justify-between relative">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-accent-emerald shadow-[0_0_10px_#5fd1a3]" />
                <span className="font-mono text-xs uppercase tracking-wider text-ink-50">with codemap</span>
              </div>
              <span className="text-[11px] font-mono text-ink-200">indexed + grounded</span>
            </div>
            <ul className="px-6 py-5 divide-y divide-white/5 relative">
              {wins.map((f, i) => (
                <li key={i} className="py-3 grid grid-cols-[18px_1fr] gap-3 items-start">
                  <Icon name="check" size={14} className="text-accent-cyan mt-1" />
                  <div>
                    <div className="text-white text-sm font-medium">{f.l}</div>
                    <div className="text-ink-100 text-sm">{f.r}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 card p-5 md:p-6 flex items-start md:items-center gap-4 flex-col md:flex-row">
          <div className="size-10 rounded-lg flex items-center justify-center bg-white/5 ring-1 ring-white/10 text-accent-amber">
            <Icon name="bolt" size={18} />
          </div>
          <div className="flex-1">
            <div className="text-white font-medium">Stop paying tokens to teach an agent your codebase, every prompt.</div>
            <div className="text-ink-100 text-sm">CodeMap caches structure once and serves it through MCP — typical sessions cut context tokens by <span className="text-white">62–84%</span>.</div>
          </div>
          <a href="#how" className="btn-ghost rounded-md px-3 py-2 text-sm inline-flex items-center gap-2">
            See the pipeline <Icon name="arrow-right" size={13} />
          </a>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export function Pipeline() {
  return (
    <section id="how" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow="How CodeMap works"
          title="A six-stage pipeline from raw source to agent context."
          sub="Every stage is local-first, incremental, and exposed as a typed MCP tool. Nothing leaves your machine unless you opt into team sync."
        />

        <div className="mt-14 grid md:grid-cols-6 gap-3 relative">
          <div className="hidden md:block absolute left-0 right-0 top-[68px] h-px"
               style={{ background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.4) 20%, rgba(93,214,224,0.4) 80%, transparent)" }} />
          {pipelineSteps.map((s) => (
            <div key={s.k} className="relative">
              <div className="card p-5 h-full relative z-10">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-ink-200">{s.k}</span>
                  <Icon name={s.icon} size={16} className="text-accent-cyan" />
                </div>
                <div className="mt-8 text-white font-medium">{s.t}</div>
                <div className="mt-1 text-ink-100 text-sm leading-relaxed">{s.d}</div>
              </div>
              <span className="hidden md:block absolute left-1/2 -translate-x-1/2 top-[64px] size-2 rounded-full bg-white z-20 shadow-[0_0_12px_#fff]" />
            </div>
          ))}
        </div>

        <div className="mt-10 grid md:grid-cols-4 gap-4">
          {[
            { k: "Files indexed",  v: "4,182",  s: "in 6.3s" },
            { k: "Symbols",        v: "61,204", s: "defs + refs" },
            { k: "Edges",          v: "18,937", s: "module · file · symbol" },
            { k: "Cache hit rate", v: "94.7%",  s: "across 12k prompts" },
          ].map(m => (
            <div key={m.k} className="card p-5">
              <div className="text-ink-200 text-xs font-mono uppercase tracking-wider">{m.k}</div>
              <div className="mt-2 text-3xl font-semibold gradient-text">{m.v}</div>
              <div className="mt-1 text-xs text-ink-100">{m.s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// MCP tools (interactive — needs "use client" at the top of the file)
// ---------------------------------------------------------------------------

function ToolCard({ t, active, onPick }: { t: McpTool; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={`card text-left p-4 transition relative ${active ? "ring-glow" : "hover:bg-white/[0.02]"}`}
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm">
          <span className="text-accent-cyan">codemap</span>
          <span className="text-ink-200">.</span>
          <span className="text-white">{t.name}</span>
        </div>
        <span className={`size-1.5 rounded-full ${active ? "bg-accent-cyan shadow-[0_0_10px_#5dd6e0]" : "bg-ink-300"}`} />
      </div>
      <div className="mt-2 text-sm text-ink-100 leading-snug">{t.sub}</div>
    </button>
  );
}

function Terminal({ t }: { t: McpTool }) {
  return (
    <div className="terminal-bg rounded-2xl overflow-hidden">
      <div className="hairline-b px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]/70" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/70" />
          <span className="size-2.5 rounded-full bg-[#28c840]/70" />
        </div>
        <span className="font-mono text-[11px] text-ink-200">mcp · stdio · 12ms</span>
        <span className="font-mono text-[11px] text-ink-200">codemap-mcp v0.1.4</span>
      </div>
      <div className="p-5 font-mono text-[13px] leading-relaxed term-scroll overflow-x-auto">
        <div className="text-ink-200">$ codemap.{t.name}</div>
        <div className="text-ink-100"><span className="text-accent-violet">›</span> {t.args}</div>
        <div className="mt-3 text-ink-200">// response</div>
        {t.output.map((row, i) => (
          <div key={i} className="grid grid-cols-[64px_1fr_auto] gap-3 py-0.5">
            <span className="text-accent-cyan">{row[0]}</span>
            <span className="text-ink-50 truncate">{row[1]}</span>
            <span className="text-ink-200">{row[2]}</span>
          </div>
        ))}
        <div className="mt-3 text-ink-200">⏎ done · returned to agent</div>
      </div>
    </div>
  );
}

export function McpTools() {
  const [active, setActive] = React.useState(0);
  const t = mcpTools[active];
  return (
    <section id="mcp" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow="MCP tools"
          title="A typed toolkit for agents — not a black-box plugin."
          sub="Every capability is a discoverable MCP tool with strict schemas. Your agent picks the right call. You see exactly what it asked for."
        />
        <div className="mt-14 grid lg:grid-cols-[1fr_1.1fr] gap-6">
          <div className="grid sm:grid-cols-2 gap-3 self-start">
            {mcpTools.map((tool, i) => (
              <ToolCard key={tool.name} t={tool} active={i === active} onPick={() => setActive(i)} />
            ))}
          </div>
          <div>
            <Terminal t={t} />
            <div className="mt-3 text-xs text-ink-200 font-mono flex items-center gap-3 flex-wrap">
              <span>Also exposed:</span>
              <span className="chip">trigger_reimport</span>
              <span className="chip">get_blast_radius</span>
              <span className="chip">describe_module</span>
              <span className="chip">trace_call_path</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export function Workflow() {
  return (
    <section id="workflow" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid lg:grid-cols-[1fr_1fr] gap-14 items-start">
          <div>
            <SectionHeader
              eyebrow="Agent workflow"
              title="Indexing is not enough. CodeMap guides the loop."
              sub="Hooks enforce a six-step workflow so agents stop short-circuiting straight to edit. Stale context is invalidated automatically, so the next turn is grounded in reality, not memory."
            />
            <div className="mt-8 flex flex-wrap gap-2">
              {["pre-edit hook", "post-write hook", "stale-context guard", "blast-radius gate", "test-impact gate"].map(t => (
                <span key={t} className="chip">{t}</span>
              ))}
            </div>
          </div>

          <div className="relative">
            <ol className="relative pl-7 border-l border-white/10">
              {workflowSteps.map((s, i) => (
                <li key={s.k} className="relative pb-6 last:pb-0">
                  <span className="absolute -left-[33px] top-0 size-6 rounded-full glass ring-1 ring-white/10 flex items-center justify-center text-accent-cyan">
                    <Icon name={s.icon} size={12} />
                  </span>
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-ink-200">step {String(i + 1).padStart(2, "0")}</span>
                      <span className="text-white font-medium">{s.k}</span>
                    </div>
                    <div className="mt-1 text-ink-100 text-sm">{s.d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Big graph viz
// ---------------------------------------------------------------------------

const clusters = [
  { x: 180, y: 220, r: 70, name: "auth",    color: "#5dd6e0" },
  { x: 420, y: 160, r: 86, name: "api",     color: "#a78bfa" },
  { x: 700, y: 240, r: 64, name: "billing", color: "#f5c97c" },
  { x: 320, y: 380, r: 62, name: "db",      color: "#5fd1a3" },
  { x: 580, y: 400, r: 70, name: "ui",      color: "#ff7a8a" },
];
const clusterEdges: [number, number][] = [[0,1],[1,2],[1,3],[3,0],[1,4],[4,3],[2,1]];

function BigGraph() {
  return (
    <svg viewBox="0 0 880 520" className="w-full h-auto">
      <defs>
        <radialGradient id="cg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.10" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      {clusterEdges.map(([a, b], i) => (
        <line key={i}
              x1={clusters[a].x} y1={clusters[a].y}
              x2={clusters[b].x} y2={clusters[b].y}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1}
              className={i % 2 ? "edge-dash" : ""} />
      ))}
      {clusters.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={c.r * 1.5} fill="url(#cg)" />
          <circle cx={c.x} cy={c.y} r={c.r}
                  fill="rgba(14, 16, 20, 0.7)"
                  stroke={c.color}
                  strokeOpacity={0.55}
                  strokeWidth={1} />
          {[0,1,2,3,4,5].map(k => {
            const a = (k / 6) * Math.PI * 2;
            const rr = c.r * 0.55;
            const sx = Math.round((c.x + Math.cos(a) * rr) * 100) / 100;
            const sy = Math.round((c.y + Math.sin(a) * rr) * 100) / 100;
            return (
              <circle key={k} cx={sx} cy={sy} r={3.5}
                      fill={c.color} fillOpacity={0.85}
                      className="node-pulse"
                      style={{ animationDelay: `${k * 0.2}s` }} />
            );
          })}
          <text x={c.x} y={c.y + 5} textAnchor="middle"
                fontFamily="Geist Mono" fontSize={13} fill="#d6dae3">
            {c.name}/
          </text>
        </g>
      ))}
    </svg>
  );
}

export function GraphViz() {
  return (
    <section id="graph" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid lg:grid-cols-[5fr_7fr] gap-12 items-center">
          <div>
            <SectionHeader
              eyebrow="Code graph"
              title="See your architecture the way an agent sees it."
              sub="Modules, packages, symbols and tests resolved into a single navigable graph. Hover any cluster to see its inbound/outbound edges and ownership."
            />
            <div className="mt-8 grid grid-cols-2 gap-3">
              {[
                { k: "Modules",  v: "42" },
                { k: "Packages", v: "11" },
                { k: "Cycles",   v: "2 detected" },
                { k: "Orphans",  v: "184 files" },
              ].map(s => (
                <div key={s.k} className="card p-4">
                  <div className="text-ink-200 text-xs font-mono uppercase tracking-wider">{s.k}</div>
                  <div className="text-xl text-white mt-1">{s.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              <span className="chip"><Icon name="filter" size={11} /> filter by depth</span>
              <span className="chip"><Icon name="layers" size={11} /> group by package</span>
              <span className="chip"><Icon name="alert"  size={11} /> highlight cycles</span>
            </div>
          </div>

          <div className="card ring-glow p-4 md:p-6 relative overflow-hidden">
            <div className="flex items-center justify-between text-[11px] font-mono text-ink-200 mb-3">
              <span>graph · main · 4,182 files</span>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent-cyan"/> module</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent-violet"/> package</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent-amber"/> external</span>
              </div>
            </div>
            <BigGraph />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

export function Editors() {
  return (
    <section id="editors" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow="Supported editors"
          title="Plug into the agent you already use."
          sub="One MCP server — every modern AI coding surface understands your repo. No vendor lock, no proxy, no source upload."
        />
        <div className="mt-12 grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          {editorIntegrations.map(e => (
            <div key={e.name} className="card p-5 flex items-center gap-4">
              <div className="size-10 rounded-lg flex items-center justify-center bg-white/5 ring-1 ring-white/10 text-accent-cyan text-lg">
                {e.glyph}
              </div>
              <div className="flex-1">
                <div className="text-white font-medium">{e.name}</div>
                <div className="text-ink-200 text-xs font-mono">{e.sub}</div>
              </div>
              {e.ready
                ? <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-emerald/10 text-accent-emerald ring-1 ring-accent-emerald/20">ready</span>
                : <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-ink-100 ring-1 ring-white/10">soon</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export function Features() {
  return (
    <section id="features" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow="What you get"
          title="A serious infrastructure layer, not a plugin."
          sub="The features below ship on day one. No quotas. No “coming soon” checkboxes."
        />
        <div className="mt-14 grid md:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden">
          {features.map(f => (
            <div key={f.t} className="bg-ink-900 p-7 hover:bg-ink-850 transition">
              <Icon name={f.icon} size={20} className="text-accent-cyan" />
              <div className="mt-5 text-white font-medium">{f.t}</div>
              <div className="mt-1 text-ink-100 text-sm leading-relaxed">{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export function Pricing() {
  return (
    <section id="pricing" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow="Pricing"
          title="Local-first. Honest pricing. No usage roulette."
          sub="Pay for the size of your codebase, not for tokens you didn’t spend. Self-hosted is a first-class option."
        />
        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {plans.map(p => (
            <div key={p.name} className={`card p-7 relative ${p.featured ? "ring-glow" : ""}`}>
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 chip"
                      style={{
                        background: "linear-gradient(180deg, rgba(167,139,250,0.18), rgba(167,139,250,0.08))",
                        boxShadow: "inset 0 0 0 1px rgba(167,139,250,0.4)",
                      }}>
                  <span className="dot" style={{ background: "#a78bfa", boxShadow: "0 0 10px #a78bfa" }} />
                  Most popular
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <div className="text-white font-medium">{p.name}</div>
                <div className="text-ink-200 text-xs font-mono">{p.sub}</div>
              </div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-semibold gradient-text">{p.price}</span>
                {p.per && <span className="text-ink-100 text-sm">{p.per}</span>}
              </div>
              <a href={p.ctaHref}
                 className={`mt-6 block text-center rounded-lg px-3.5 py-2.5 font-medium ${p.featured ? "btn-primary" : "btn-ghost"}`}>
                {p.cta}
              </a>
              <ul className="mt-6 space-y-2">
                {p.features.map(f => (
                  <li key={f} className="grid grid-cols-[18px_1fr] gap-2 items-start text-sm">
                    <Icon name="check" size={13} className="text-accent-cyan mt-1" />
                    <span className="text-ink-50">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs font-mono text-ink-200">
          All plans: local-first · no source upload · open MCP spec · cancel any time
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

export function FinalCta() {
  return (
    <section id="cta" className="relative py-28 md:py-36">
      <div className="absolute inset-0 grid-bg opacity-60" aria-hidden />
      <div className="absolute inset-0 -z-0 pointer-events-none"
           style={{ background: "radial-gradient(800px 400px at 50% 50%, rgba(124,135,255,0.18), transparent 70%)" }} />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <span className="chip mb-6"><span className="dot" /> ready when you are</span>
        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight gradient-text leading-[1.05]">
          Stop wasting tokens teaching AI <br />
          <span className="accent-text">your codebase.</span>
        </h2>
        <p className="mt-5 text-lg text-ink-100 max-w-2xl mx-auto">
          One install. Every agent gets architectural memory.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <a href="/auth/signup" className="btn-primary inline-flex items-center gap-2 rounded-lg px-5 py-3 font-medium">
            Start free <Icon name="arrow-right" size={15} />
          </a>
          <a href="/auth" className="btn-ghost inline-flex items-center gap-2 rounded-lg px-5 py-3 font-mono text-sm">
            <Icon name="terminal" size={14} /> Sign in
          </a>
        </div>
      </div>
    </section>
  );
}
