// Project detail — header w/ status, latest import, repository meta, history, quick actions.

const HISTORY = [
  { id: "imp_8a2", status: "completed", started: "Apr 25 · 14:02", duration: "1m 44s", files: 248 },
  { id: "imp_8a1", status: "completed", started: "Apr 24 · 09:18", duration: "1m 51s", files: 246 },
  { id: "imp_8a0", status: "failed", started: "Apr 22 · 11:01", duration: "12s", files: 0 },
];

function ProjectDetail({ project, onNavigate }) {
  const p = project || { name: "codemap-web", repo: "trieuluan/codemap", branch: "master", status: "ready", lastImport: "2 hours ago", files: 248, lang: "TypeScript", id: "codemap-web" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 4 }}>
            <span style={{ cursor: "pointer" }} onClick={() => onNavigate({ route: "/projects" })}>Projects</span>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: "var(--foreground)" }}>{p.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>{p.name}</h2>
            <StatusBadge status={p.status} />
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted-foreground)", marginTop: 6 }}>
            {p.repo} · {p.branch}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm"><Icon name="pencil" size={14} />Edit</Button>
          <Button variant="outline" size="sm"><Icon name="rotate-cw" size={14} />Re-import</Button>
          <Button size="sm" onClick={() => onNavigate({ route: "/projects/" + p.id + "/map", project: p })}>Open mapping<Icon name="arrow-right" size={14} /></Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Latest import */}
          <Card>
            <CardHeader><CardTitle>Latest import</CardTitle></CardHeader>
            <CardContent style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <Stat label="Status" value={<Badge variant="success"><StatusDot />Completed</Badge>} />
              <Stat label="Files indexed" value={<span style={{ fontFamily: "var(--font-mono)" }}>{p.files}</span>} />
              <Stat label="Duration" value={<span style={{ fontFamily: "var(--font-mono)" }}>1m 44s</span>} />
              <Stat label="Started" value={<span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>2h ago</span>} />
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader><CardTitle>Import history</CardTitle></CardHeader>
            <CardContent style={{ paddingTop: 12, paddingBottom: 8 }}>
              <div style={{ borderTop: "1px solid var(--border)" }}>
                {HISTORY.map(h => (
                  <div key={h.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                    <Icon name={h.status === "completed" ? "check-circle-2" : "x-circle"} size={16} style={{ color: h.status === "completed" ? "oklch(0.7 0.15 145)" : "var(--destructive)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{h.id}</span>
                    <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{h.started}</span>
                    <span style={{ fontSize: 13, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>{h.duration}</span>
                    <span style={{ fontSize: 13, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>{h.files} files</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar quick actions + repo */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <CardHeader><CardTitle>Repository</CardTitle></CardHeader>
            <CardContent style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              <Field icon="git-branch" label="Branch" value={p.branch} mono />
              <Field icon="github" label="Provider" value="GitHub" />
              <Field icon="lock" label="Visibility" value="Private" />
              <Field icon="file-code" label="Files" value={p.files} mono />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
            <CardContent style={{ paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Button variant="secondary" style={{ height: "auto", padding: "16px 8px", flexDirection: "column", gap: 6 }}><Icon name="search" size={16} /><span style={{ fontSize: 12 }}>Search</span></Button>
              <Button variant="secondary" style={{ height: "auto", padding: "16px 8px", flexDirection: "column", gap: 6 }}><Icon name="git-graph" size={16} /><span style={{ fontSize: 12 }}>Graph</span></Button>
              <Button variant="secondary" style={{ height: "auto", padding: "16px 8px", flexDirection: "column", gap: 6 }}><Icon name="bar-chart-3" size={16} /><span style={{ fontSize: 12 }}>Insights</span></Button>
              <Button variant="secondary" style={{ height: "auto", padding: "16px 8px", flexDirection: "column", gap: 6 }}><Icon name="key-round" size={16} /><span style={{ fontSize: 12 }}>API key</span></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 14 }}>{value}</div>
    </div>
  );
}
function Field({ icon, label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--muted-foreground)", fontSize: 13 }}>
        <Icon name={icon} size={13} />{label}
      </span>
      <span style={{ fontSize: 13, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>{value}</span>
    </div>
  );
}

Object.assign(window, { ProjectDetail });
