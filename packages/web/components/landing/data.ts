// Edit copy + content here. Pure data — no JSX.

import type { IconName } from "./icon";

export const EditorLogos: { name: string; glyph: string }[] = [
  { name: "Claude Code", glyph: "◆" },
  { name: "Cursor",      glyph: "▲" },
  { name: "Codex",       glyph: "●" },
  { name: "Gemini CLI",  glyph: "✦" },
  { name: "VS Code",     glyph: "▣" },
  { name: "Windsurf",    glyph: "≋" },
  { name: "OpenCode",    glyph: "◈" },
  { name: "Continue",    glyph: "▶" },
];

export const editorIntegrations: { name: string; glyph: string; sub: string; ready: boolean }[] = [
  { name: "Claude Code", glyph: "◆", sub: "MCP-native",            ready: true  },
  { name: "Cursor",      glyph: "▲", sub: "MCP via .cursorrules",  ready: true  },
  { name: "VS Code",     glyph: "▣", sub: "Extension + MCP",       ready: true  },
  { name: "Codex",       glyph: "●", sub: "CLI bridge",            ready: true  },
  { name: "Gemini CLI",  glyph: "✦", sub: "MCP server",            ready: true  },
  { name: "Windsurf",    glyph: "≋", sub: "MCP server",            ready: true  },
  { name: "OpenCode",    glyph: "◈", sub: "Native plugin",         ready: true  },
  { name: "Continue",    glyph: "▶", sub: "Roadmap",               ready: false },
];

export const pipelineSteps: { k: string; t: string; d: string; icon: IconName }[] = [
  { k: "01", t: "Repository",           d: "Local clone. Never uploaded.",        icon: "package" },
  { k: "02", t: "Semantic indexing",    d: "AST + tree-sitter + embeddings.",      icon: "cpu" },
  { k: "03", t: "Dependency graph",     d: "File · module · package edges.",       icon: "graph" },
  { k: "04", t: "Symbol relationships", d: "Defs, refs, calls, types, tests.",     icon: "branch" },
  { k: "05", t: "MCP tools",            d: "Typed surface for any AI agent.",      icon: "terminal" },
  { k: "06", t: "Agent understanding",  d: "Architectural memory in every turn.",  icon: "sparkle" },
];

export interface McpTool {
  name: string;
  sub: string;
  args: string;
  output: [string, string, string][];
}

export const mcpTools: McpTool[] = [
  {
    name: "search_codebase",
    sub: "Hybrid lexical + semantic search across files and symbols.",
    args: 'query: "stale auth tokens", scope: "src/auth"',
    output: [
      ["match", "src/auth/session.ts:142", "isExpired(token: SessionToken): boolean"],
      ["match", "src/auth/refresh.ts:58",  "rotateRefreshToken(...)"],
      ["match", "src/api/middleware.ts:21","requireFreshSession()"],
    ],
  },
  {
    name: "find_related_files",
    sub: "Walks dep edges + co-edit history to surface coupled files.",
    args: 'file: "src/db/schema.ts", depth: 2',
    output: [
      ["edge", "src/db/migrate.ts",       "imports schema.ts (high)"],
      ["edge", "src/api/users.ts",        "queries User table (high)"],
      ["edge", "tests/db/schema.test.ts", "covers 14 symbols (med)"],
    ],
  },
  {
    name: "get_symbol_context",
    sub: "Definition, type, all callers, and a tight code window.",
    args: 'symbol: "rotateRefreshToken"',
    output: [
      ["def",  "src/auth/refresh.ts:58",   "(uid: string) => Promise<Session>"],
      ["call", "src/api/middleware.ts:21", "via requireFreshSession()"],
      ["call", "src/jobs/sweep.ts:104",    "nightly invalidation cron"],
    ],
  },
  {
    name: "find_usages",
    sub: "Every reference of a symbol across the workspace, typed.",
    args: 'symbol: "User", kind: "type"',
    output: [
      ["ref", "src/api/users.ts",   "84 references"],
      ["ref", "src/ui/Profile.tsx", "12 references"],
      ["ref", "tests/**/*.ts",      "47 references"],
    ],
  },
  {
    name: "get_project_insights",
    sub: "Hotspots, coupling, churn, and architectural anti-patterns.",
    args: 'window: "30d"',
    output: [
      ["hot",  "src/billing/*",    "32% of churn, 4 owners"],
      ["risk", "src/api ↔ src/db", "cyclic edge introduced 6d ago"],
      ["clue", "src/legacy/*",     "0 inbound refs · safe to delete"],
    ],
  },
  {
    name: "suggest_patch",
    sub: "Proposes a minimal diff with affected callers + test plan.",
    args: 'goal: "rename User.email → User.contactEmail"',
    output: [
      ["plan", "47 callers", "across 12 files"],
      ["risk", "low",         "no public API change"],
      ["diff", "+62 / -62",   "ready to apply"],
    ],
  },
];

export const workflowSteps: { k: string; d: string; icon: IconName }[] = [
  { k: "Explore",    d: "Agent maps the territory before touching code.",  icon: "compass" },
  { k: "Understand", d: "Resolves symbols, types, callers and tests.",      icon: "search" },
  { k: "Edit",       d: "Writes a minimal patch grounded in the graph.",    icon: "code" },
  { k: "Verify",     d: "Runs blast-radius checks and impacted tests.",     icon: "shield" },
  { k: "Reimport",   d: "Hooks invalidate stale context after writes.",     icon: "git-merge" },
  { k: "Complete",   d: "Confidence score + diff + traced reasoning.",      icon: "check" },
];

export const features: { t: string; d: string; icon: IconName }[] = [
  { t: "Semantic indexing",        d: "AST + tree-sitter + embeddings, incremental on every save.", icon: "cpu" },
  { t: "Symbol-level intelligence",d: "Defs, refs, calls, types and tests resolved per symbol.",    icon: "graph" },
  { t: "Blast radius analysis",    d: "List every caller, type and test impacted before edit.",     icon: "shield" },
  { t: "AI workflow hooks",        d: "Pre-edit, post-write and reimport hooks for any agent.",     icon: "git-merge" },
  { t: "Auto reimport",            d: "Indexes invalidate on write; agents see fresh context.",     icon: "spark-zap" },
  { t: "Dependency mapping",       d: "Module · package · external graph kept always-current.",     icon: "layers" },
  { t: "Multi-repo support",       d: "Reason across monorepos, sub-repos and external deps.",      icon: "branch" },
  { t: "Local-first",              d: "Indexes live on your disk. Source never leaves.",            icon: "shield" },
  { t: "MCP-native",               d: "Discoverable, typed tools every agent can use.",             icon: "terminal" },
];

export interface Plan {
  name: string;
  price: string;
  per?: string;
  sub: string;
  cta: string;
  ctaHref: string;
  featured?: boolean;
  features: string[];
}

export const plans: Plan[] = [
  {
    name: "Basic",
    price: "Free",
    sub: "Try with public repositories.",
    cta: "Get started free",
    ctaHref: "/auth/signup",
    features: [
      "3 projects",
      "10 cloud imports / month",
      "Up to 5 000 files / import",
      "Public repositories only",
      "MCP symbol search & file reads",
    ],
  },
  {
    name: "Developer",
    price: "$9",
    per: "/mo",
    sub: "Full context. Private repos. No import limits.",
    cta: "Start Developer",
    ctaHref: "/auth/signup",
    featured: true,
    features: [
      "Unlimited projects",
      "Unlimited cloud imports",
      "Up to 100 000 files / import",
      "Private repository imports",
      "Blast radius & impact analysis",
      "Dependency graph & insights",
      "Works with Claude, Cursor, Copilot & more",
    ],
  },
  {
    name: "Team",
    price: "$29",
    per: "/mo",
    sub: "Everything in Developer, shared across your team.",
    cta: "Start Team",
    ctaHref: "/auth/signup",
    features: [
      "Unlimited projects & imports",
      "Unlimited indexed files",
      "Private repository imports",
      "Dependency graph & insights",
      "Team workspace & shared projects",
      "Works with Claude, Cursor, Copilot & more",
    ],
  },
];
