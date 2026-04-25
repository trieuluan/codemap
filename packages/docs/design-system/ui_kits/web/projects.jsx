// Projects list — mirrors /projects route. Search + sort + project cards.

const PROJECTS = [
  { id: "codemap-web", name: "codemap-web", repo: "trieuluan/codemap", branch: "master", status: "ready", lastImport: "2 hours ago", files: 248, lang: "TypeScript" },
  { id: "fastify-api", name: "fastify-api", repo: "trieuluan/codemap", branch: "feat/imports", status: "importing", lastImport: "running…", files: 0, lang: "TypeScript" },
  { id: "manga-dex", name: "truyendex", repo: "trieuluan/truyendex", branch: "develop", status: "ready", lastImport: "yesterday", files: 612, lang: "TypeScript" },
  { id: "frappe-fork", name: "fork_frappe_docker", repo: "trieuluan/fork_frappe_docker", branch: "main", status: "failed", lastImport: "3 days ago", files: 89, lang: "Python" },
  { id: "nebular", name: "nebular", repo: "trieuluan/nebular", branch: "master", status: "draft", lastImport: "—", files: 0, lang: "TypeScript" },
];

function StatusBadge({ status }) {
  if (status === "ready") return <Badge variant="success"><StatusDot tone="success" />Ready</Badge>;
  if (status === "importing") return <Badge variant="warning"><StatusDot tone="warning" />Importing</Badge>;
  if (status === "failed") return <Badge variant="danger"><StatusDot tone="danger" />Failed</Badge>;
  if (status === "draft") return <Badge variant="outline"><StatusDot tone="neutral" />Draft</Badge>;
  return null;
}

function Projects({ onNavigate }) {
  const [q, setQ] = React.useState("");
  const filtered = PROJECTS.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.repo.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>Projects</h2>
          <p style={{ color: "var(--muted-foreground)", margin: "4px 0 0 0", fontSize: 14 }}>{filtered.length} project{filtered.length !== 1 && "s"} · search and sort across your workspace</p>
        </div>
        <Button><Icon name="plus" size={14} />New Project</Button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", display: "inline-flex" }}>
            <Icon name="search" size={14} />
          </span>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects…" style={{ paddingLeft: 32, background: "var(--secondary)" }} />
        </div>
        <Button variant="outline" size="sm"><Icon name="arrow-down-up" size={14} />Last imported</Button>
        <Button variant="outline" size="sm"><Icon name="filter" size={14} />Status</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {filtered.map(p => (
          <Card key={p.id}>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{p.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.repo} · {p.branch}
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--muted-foreground)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="clock" size={12} />Last import {p.lastImport}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="file-code" size={12} />{p.files} files</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Icon name="circle" size={12} />{p.lang}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={() => onNavigate({ route: "/projects/" + p.id, project: p })}>Open project</Button>
                <Button size="sm" variant="outline" onClick={() => onNavigate({ route: "/projects/" + p.id + "/map", project: p })}>Open mapping<Icon name="arrow-right" size={12} /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Projects, StatusBadge });
