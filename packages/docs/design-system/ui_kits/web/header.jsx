// Sticky top bar. Mirrors _source/features/dashboard/header.tsx.

function Header({ title = "Overview" }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [theme, setTheme] = React.useState(() => document.documentElement.classList.contains("dark") ? "dark" : "light");
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("codemap-theme", next); } catch (e) {}
  };
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 40,
      height: 56, display: "flex", alignItems: "center", gap: 16,
      borderBottom: "1px solid var(--border)", background: "var(--background)",
      padding: "0 24px",
    }}>
      <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{title}</h1>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", display: "inline-flex" }}>
            <Icon name="search" size={14} />
          </span>
          <input
            placeholder="Search…"
            style={{
              width: 256, height: 36, padding: "0 12px 0 32px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--secondary)", color: "var(--foreground)",
              fontSize: 14, outline: "none",
            }}
          />
        </div>
        <Button variant="ghost" size="icon" onClick={toggleTheme} title={theme === "dark" ? "Switch to light" : "Switch to dark"}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </Button>
        <Button variant="ghost" size="icon" style={{ position: "relative" }}>
          <Icon name="bell" size={16} />
          <span style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 999, background: "oklch(0.7 0.15 145)" }} />
        </Button>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", borderRadius: 999 }}
          >
            <Avatar initials="JL" size={32} />
          </button>
          {menuOpen && (
            <div style={{
              position: "absolute", right: 0, top: 40, width: 224,
              background: "var(--popover)", border: "1px solid var(--border)",
              borderRadius: 10, boxShadow: "var(--shadow-md)", padding: 4, zIndex: 60,
            }}>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>John Le</div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>john@codemap.dev</div>
              </div>
              <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
              <MenuItem icon="folder-kanban" label="Projects" />
              <MenuItem icon="settings" label="Settings" />
              <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
              <MenuItem icon="log-out" label="Sign out" tone="destructive" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ icon, label, tone }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 6, cursor: "pointer",
        fontSize: 13, color: tone === "destructive" ? "var(--destructive)" : "var(--foreground)",
        background: hover ? "var(--accent)" : "transparent",
      }}
    >
      <Icon name={icon} size={14} />
      {label}
    </div>
  );
}

Object.assign(window, { Header });
