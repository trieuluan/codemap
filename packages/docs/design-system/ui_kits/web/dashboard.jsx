// Dashboard — mirrors _source/app/(protected)/dashboard/page.tsx + features/dashboard/*

const STATS = [
  { id: "projects", label: "Projects", value: "3", icon: "folder-kanban" },
  { id: "api", label: "API Calls", value: "12.4k", icon: "code" },
  { id: "team", label: "Team Members", value: "5", icon: "users" },
  { id: "uptime", label: "Uptime", value: "100%", icon: "activity" },
];

const STEPS = [
  { id: "connect", title: "Connect a project", desc: "Import your first repository to get started", icon: "git-branch", done: true },
  { id: "api", title: "Configure API", desc: "Set up your API keys and endpoints", icon: "settings", done: true },
  { id: "team", title: "Invite your team", desc: "Collaborate with your team members", icon: "users", done: false },
  { id: "explore", title: "Explore the dashboard", desc: "Discover features and capabilities", icon: "compass", done: false },
];

const ACTIONS = [
  { id: "new", label: "New Project", icon: "plus" },
  { id: "import", label: "Import Repo", icon: "upload" },
  { id: "docs", label: "API Docs", icon: "code-2" },
  { id: "int", label: "Integrations", icon: "zap" },
];

const ACTIVITY = [
  { type: "import", message: "Import completed for codemap-web", project: "codemap-web", when: "2 hours ago" },
  { type: "api", message: "Created API key Production-MCP", project: "Account", when: "yesterday" },
  { type: "invite", message: "Invited huy@codemap.dev to the workspace", project: "Team", when: "3 days ago" },
];

function Dashboard({ onNavigate }) {
  const done = STEPS.filter(s => s.done).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Welcome */}
      <section style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>Welcome, John</h2>
          <p style={{ color: "var(--muted-foreground)", margin: "4px 0 0 0" }}>Here's an overview of your workspace and getting started guide.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm"><Icon name="book" size={14} />Documentation</Button>
          <Button size="sm" onClick={() => onNavigate({ route: "/projects" })}>New Project<Icon name="arrow-right" size={14} /></Button>
        </div>
      </section>

      {/* Stats */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {STATS.map(s => (
          <Card key={s.id}>
            <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
              <IconTile name={s.icon} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </section>

      {/* Onboarding */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Getting started</h3>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "2px 0 0 0" }}>Complete these steps to set up your workspace</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{done} of {STEPS.length} complete</span>
            <div style={{ width: 96, height: 6, background: "var(--secondary)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${(done / STEPS.length) * 100}%`, height: "100%", background: "var(--primary)" }} />
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {STEPS.map(step => <OnboardingCard key={step.id} step={step} />)}
        </div>
      </section>

      {/* Activity + Actions */}
      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        <Card>
          <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
          <CardContent style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
            {ACTIVITY.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ marginTop: 2, width: 32, height: 32, borderRadius: 999, background: "var(--secondary)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", flexShrink: 0 }}>
                  <Icon name={a.type === "import" ? "git-branch" : a.type === "api" ? "key-round" : "user-plus"} size={14} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{a.message}</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>in {a.project} · {a.when}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {ACTIONS.map(a => (
              <Button key={a.id} variant="secondary" style={{ height: "auto", padding: "16px 8px", flexDirection: "column", gap: 8 }}>
                <Icon name={a.icon} size={18} />
                <span style={{ fontSize: 12 }}>{a.label}</span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function OnboardingCard({ step }) {
  const [hover, setHover] = React.useState(false);
  return (
    <Card onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      borderColor: step.done ? "color-mix(in oklch, oklch(0.7 0.15 145) 30%, var(--border))" : "var(--border)",
      background: step.done ? "color-mix(in oklch, oklch(0.7 0.15 145) 5%, var(--card))" : "var(--card)",
      transition: "border-color 150ms",
    }}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <IconTile name={step.done ? "check" : step.icon} tone={step.done ? "success" : "default"} />
          {!step.done && <Icon name="arrow-right" size={14} style={{ color: "var(--muted-foreground)", opacity: hover ? 1 : 0, transition: "opacity 150ms" }} />}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{step.title}</div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>{step.desc}</div>
        </div>
        {!step.done && <Button variant="secondary" size="sm" style={{ width: "100%" }}>Get started</Button>}
      </div>
    </Card>
  );
}

Object.assign(window, { Dashboard });
