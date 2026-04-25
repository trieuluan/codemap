// Sidebar — fixed left nav. Mirrors _source/features/dashboard/sidebar.tsx.

const NAV_PRIMARY = [
  { id: "overview", label: "Overview", icon: "layout-dashboard", route: "/dashboard" },
  { id: "projects", label: "Projects", icon: "folder-kanban", route: "/projects" },
  { id: "api", label: "API", icon: "code", route: "/api" },
  { id: "team", label: "Team", icon: "users", route: "/team" },
];

const NAV_SECONDARY = [
  { id: "settings", label: "Settings", icon: "settings", route: "/dashboard/settings" },
  { id: "help", label: "Help", icon: "help-circle", route: "/help" },
];

function NavItem({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  const bg = active
    ? "var(--sidebar-accent)"
    : hover ? "var(--sidebar-accent)" : "transparent";
  const fg = active || hover
    ? "var(--sidebar-accent-foreground)"
    : "color-mix(in oklch, var(--sidebar-foreground) 65%, var(--sidebar))";
  return (
    <a
      onClick={() => onClick(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 12px", borderRadius: 6, cursor: "pointer",
        fontSize: 13, fontWeight: 500,
        background: bg, color: fg, transition: "background 120ms, color 120ms",
      }}
    >
      <Icon name={item.icon} size={16} />
      {item.label}
    </a>
  );
}

function Sidebar({ activeRoute, onNavigate }) {
  const isActive = item => {
    if (item.route === "/projects") return activeRoute === "/projects" || activeRoute.startsWith("/projects/");
    return activeRoute === item.route;
  };
  return (
    <aside style={{
      position: "fixed", inset: "0 auto 0 0", width: 256, zIndex: 50,
      background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--sidebar-border)" }}>
        <Logo size={28} />
      </div>
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_PRIMARY.map(item => (
            <NavItem key={item.id} item={item} active={isActive(item)} onClick={onNavigate} />
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_SECONDARY.map(item => (
            <NavItem key={item.id} item={item} active={isActive(item)} onClick={onNavigate} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

Object.assign(window, { Sidebar });
