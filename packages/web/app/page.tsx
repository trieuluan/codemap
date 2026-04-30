import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Braces,
  Check,
  CircleDot,
  Clock3,
  FileSearch,
  GitBranch,
  Github,
  History,
  Layers3,
  LockKeyhole,
  Network,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const productPillars = [
  {
    icon: FileSearch,
    title: "Explorer",
    description:
      "Browse indexed files, symbols, imports, exports, parse status, and focused file previews.",
  },
  {
    icon: Network,
    title: "Graph",
    description:
      "Inspect dependency flow from folder, file, and symbol-level views without loading the whole repo into chat.",
  },
  {
    icon: Sparkles,
    title: "Insights",
    description:
      "Spot cycles, orphan files, entry surfaces, parse quality, fan-in, and fan-out from deterministic index data.",
  },
  {
    icon: History,
    title: "History",
    description:
      "Compare imports across commits with backend-driven file, symbol, dependency, and metric diffs.",
  },
];

const mcpWorkflow = [
  "Link the current workspace once",
  "Index code from GitHub, GitLab, or local upload",
  "Ask your AI tool to search, read symbols, find callers, or suggest edit locations",
  "Reimport after changes to keep the map fresh",
];

const plans = [
  {
    name: "Developer",
    price: "Free while in beta",
    description: "Best for local MCP workflows and personal repositories.",
    items: ["MCP auth", "Project import", "Explorer, Graph, Insights", "History compare"],
    cta: "Start mapping",
    href: "/auth",
  },
  {
    name: "Team",
    price: "Billing in V2",
    description: "Designed for shared repositories, seats, and usage controls.",
    items: ["Team seats", "Private repo access", "Usage limits", "Billing controls"],
    cta: "Coming in V2",
    href: "/auth",
    comingSoon: true,
  },
];

function ProductPreview() {
  return (
    <div className="mx-auto mt-14 max-w-6xl overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CircleDot className="size-3.5 text-emerald-500" />
          codemap-web
          <span className="text-muted-foreground">/ master / ready</span>
        </div>
        <Badge variant="secondary" className="font-mono">
          1,825 symbols
        </Badge>
      </div>
      <div className="grid min-h-[360px] lg:grid-cols-[260px_1fr_280px]">
        <aside className="border-b border-border bg-background p-4 lg:border-b-0 lg:border-r">
          <div className="mb-4 text-xs font-medium uppercase text-muted-foreground">
            Explorer
          </div>
          {[
            "packages/web/app",
            "features/projects/map",
            "features/projects/history",
            "packages/api/src/modules",
            "packages/mcp-server/src/tools",
          ].map((path, index) => (
            <div
              key={path}
              className={`mb-2 rounded-md px-3 py-2 text-sm ${
                index === 1
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {path}
            </div>
          ))}
        </aside>
        <section className="border-b border-border p-5 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Graph focus</p>
              <p className="text-xs text-muted-foreground">
                project-map-graph-view.tsx
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link href="/auth">Open map</Link>
            </Button>
          </div>
          <div className="relative h-64 rounded-md border border-border bg-background">
            <div className="absolute left-8 top-8 rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
              explorer
            </div>
            <div className="absolute left-[42%] top-[42%] rounded-md border border-primary/60 bg-primary/10 px-4 py-3 text-sm font-medium shadow-sm">
              graph view
            </div>
            <div className="absolute right-8 top-10 rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
              symbol drawer
            </div>
            <div className="absolute bottom-8 left-16 rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
              insights
            </div>
            <div className="absolute bottom-8 right-12 rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
              history
            </div>
            <div className="absolute left-[25%] top-[31%] h-px w-[22%] rotate-12 bg-border" />
            <div className="absolute right-[25%] top-[34%] h-px w-[22%] -rotate-12 bg-border" />
            <div className="absolute bottom-[28%] left-[28%] h-px w-[22%] -rotate-12 bg-border" />
            <div className="absolute bottom-[30%] right-[28%] h-px w-[20%] rotate-12 bg-border" />
          </div>
        </section>
        <aside className="bg-background p-4">
          <div className="mb-4 text-xs font-medium uppercase text-muted-foreground">
            Index health
          </div>
          {[
            ["Import", "completed"],
            ["Parse", "completed"],
            ["Commit", "ffca82ff"],
            ["Next action", "none"],
          ].map(([label, value]) => (
            <div key={label} className="mb-3 rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-mono text-sm">{value}</p>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#product" className="hover:text-foreground">
              Product
            </a>
            <a href="#mcp" className="hover:text-foreground">
              MCP
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Billing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth">
                Start
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center lg:pb-20 lg:pt-24">
          <Badge variant="outline" className="mb-6 gap-2">
            <Bot className="size-3.5" />
            Built for AI coding tools and large repos
          </Badge>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-tight text-balance lg:text-6xl">
            Give your AI tool a fresh map of the codebase
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground text-balance">
            CodeMap indexes files, symbols, imports, callers, history, and
            project health so coding agents can find the right edit locations
            without stuffing the whole repository into context.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/auth">
                Start with CodeMap
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/dashboard/api">
                Set up MCP
                <Braces className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
          <ProductPreview />
        </section>

        <section id="product" className="border-t border-border bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-primary">Product surface</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                One index, several ways to inspect it
              </h2>
              <p className="mt-3 text-muted-foreground">
                The web app stays useful for humans while MCP exposes the same
                indexed data to AI tools.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {productPillars.map((item) => (
                <div key={item.title} className="rounded-lg border bg-card p-5">
                  <item.icon className="size-5 text-primary" />
                  <h3 className="mt-4 font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="mcp" className="border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1fr_420px]">
            <div>
              <p className="text-sm font-medium text-primary">MCP-first workflow</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Search less, read less, edit with better context
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                CodeMap MCP tools return structured results, read plans,
                symbol ranges, import health, and suggested next actions. Small
                and large models both get a clearer path through the repo.
              </p>
              <div className="mt-8 grid gap-3">
                {mcpWorkflow.map((step) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" />
                    </div>
                    <p className="text-sm leading-6">{step}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">Supported import paths</p>
                  <p className="text-sm text-muted-foreground">
                    Connect optional providers or upload from a workspace.
                  </p>
                </div>
                <LockKeyhole className="size-5 text-muted-foreground" />
              </div>
              {[
                [Github, "GitHub", "OAuth, private repositories, default branch import"],
                [GitBranch, "GitLab", "gitlab.com OAuth and repository import"],
                [Layers3, "Local workspace", "Zip upload with sensitive files excluded"],
                [Clock3, "Reimport", "Refresh the index after commits or local changes"],
              ].map(([Icon, title, detail]) => (
                <div
                  key={String(title)}
                  className="flex gap-3 border-t border-border py-4 first:border-t-0 first:pt-0"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{String(title)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {String(detail)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="border-t border-border bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-medium text-primary">Billing</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                  Simple beta access now, billing in V2
                </h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                  Current work focuses on indexing quality, MCP reliability, and
                  product workflows. Team billing and usage controls are planned
                  for the next billing milestone.
                </p>
              </div>
              <Badge variant="secondary">V2 planned</Badge>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {plans.map((plan) => (
                <div key={plan.name} className="rounded-lg border bg-card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {plan.description}
                      </p>
                    </div>
                    {plan.comingSoon ? (
                      <Badge variant="outline">V2</Badge>
                    ) : (
                      <Badge>Beta</Badge>
                    )}
                  </div>
                  <p className="mt-6 text-2xl font-semibold">{plan.price}</p>
                  <div className="mt-6 grid gap-3">
                    {plan.items.map((item) => (
                      <div key={item} className="flex items-center gap-2 text-sm">
                        <Check className="size-4 text-primary" />
                        {item}
                      </div>
                    ))}
                  </div>
                  <Button
                    className="mt-6 w-full"
                    variant={plan.comingSoon ? "outline" : "default"}
                    asChild
                  >
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo showText={false} />
          <p>CodeMap indexes code so humans and AI tools can navigate it.</p>
        </div>
      </footer>
    </div>
  );
}
