import { Icon } from "./icon";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 hairline-b glass">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="#top" className="flex items-center gap-2.5">
            <span className="relative">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <circle cx="6"  cy="6"  r="2.5" className="text-accent-cyan" />
                <circle cx="18" cy="6"  r="2.5" className="text-accent-violet" />
                <circle cx="12" cy="18" r="2.5" className="text-white" />
                <path d="M8 7l8 0M7.5 8 12 16M16.5 8 12.5 16" className="text-ink-200" />
              </svg>
            </span>
            <span className="font-semibold tracking-tight text-white">CodeMap</span>
            <span className="hidden md:inline text-[10px] font-mono uppercase tracking-wider text-ink-100 px-1.5 py-0.5 rounded bg-white/5 ring-1 ring-white/10">
              v0.1 · beta
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-ink-100">
            <a href="#how"      className="hover:text-white transition">How it works</a>
            <a href="#mcp"      className="hover:text-white transition">MCP tools</a>
            <a href="#editors"  className="hover:text-white transition">Editors</a>
            <a href="#pricing"  className="hover:text-white transition">Pricing</a>
            <a href="#docs"     className="hover:text-white transition">Docs</a>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <a href="/auth" className="text-sm text-ink-100 hover:text-white px-3 py-1.5">Sign in</a>
          <a href="/auth/signup" className="btn-primary text-sm font-medium px-3.5 py-1.5 rounded-md">Start free</a>
        </div>
      </div>
    </header>
  );
}
