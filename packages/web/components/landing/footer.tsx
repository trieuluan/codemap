import { Icon, type IconName } from "./icon";

function FootCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-ink-200 mb-3">{title}</div>
      <ul className="space-y-2">
        {links.map(l => (
          <li key={l}><a href="#" className="text-sm text-ink-50 hover:text-white">{l}</a></li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const social: IconName[] = ["github", "globe", "play-circle"];
  return (
    <footer className="relative pt-12 pb-12 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-[2fr_1fr_1fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <circle cx="6"  cy="6"  r="2.5" className="text-accent-cyan" />
              <circle cx="18" cy="6"  r="2.5" className="text-accent-violet" />
              <circle cx="12" cy="18" r="2.5" className="text-white" />
              <path d="M8 7l8 0M7.5 8 12 16M16.5 8 12.5 16" className="text-ink-200" />
            </svg>
            <span className="font-semibold text-white">CodeMap</span>
          </div>
          <p className="mt-4 text-sm text-ink-100 max-w-sm leading-relaxed">
            The semantic layer between your repository and AI coding agents. Local-first. MCP-native. Open spec.
          </p>
          <div className="mt-5 flex gap-2">
            {social.map(i => (
              <a key={i} href="#"
                 className="size-9 rounded-md ring-1 ring-white/10 bg-white/[0.02] flex items-center justify-center text-ink-100 hover:text-white hover:bg-white/5">
                <Icon name={i} size={14} />
              </a>
            ))}
          </div>
        </div>
        <FootCol title="Product"   links={["MCP tools","Editors","Pricing","Changelog","Roadmap"]} />
        <FootCol title="Resources" links={["Docs","MCP spec","Examples","Benchmarks","Status"]} />
        <FootCol title="Company"   links={["About","Blog","Careers","Security","Contact"]} />
      </div>
      <div className="mx-auto max-w-7xl px-6 mt-10 pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-mono text-ink-200">
        <span>© 2026 CodeMap Labs · Built for engineers, in the open.</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-accent-emerald"/> all systems normal</span>
          <span>v0.1.4</span>
          <a href="#" className="hover:text-white">Privacy</a>
          <a href="#" className="hover:text-white">Terms</a>
        </span>
      </div>
    </footer>
  );
}
