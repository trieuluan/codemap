# UI Routes Reference

| Route | Description |
|---|---|
| `/` | Public landing page (unauthenticated) |
| `/auth` | Sign-in page; redirects to `/dashboard` when already logged in |
| `/auth/signup` | Sign-up page |
| `/auth/forgot-password` | Password reset |
| `/dashboard` | Overview: stats cards (Projects, API Calls, Team Members, Uptime), Getting Started checklist, Recent Activity, Quick Actions |
| `/projects` | Project list: search bar, sort dropdown, "New Project" CTA, project cards with status badge, repo/branch/import info, "Open project" + "Open mapping" actions |
| `/projects/[projectId]` | Project detail: status badge, Re-import / Open mapping / Edit buttons, Latest import info, Repository + branch metadata, Import history list, Quick actions sidebar |
| `/projects/[projectId]/map` | **Mapping** — 3-tab nav (Mapping / Insights / Graph). Status banner + 3-column code explorer |
| `/projects/[projectId]/map/insights` | **Insights** — stat summary cards, top files by imports/inbound, folder breakdown, orphan files, entry-like files, circular dependency candidates |
| `/projects/[projectId]/map/graph` | **Graph** — interactive React Flow dependency graph with filter sidebar (language, folder, cycles-only), MiniMap, Controls |

## Global shell (authenticated)

- **Left sidebar nav**: Overview, Projects, API, Team; Settings + Help at bottom
- **Top bar**: app logo + title, global search, notification bell, user avatar
- **Design language**: dark theme (`bg-sidebar`, `bg-card`), `border-border/70` dividers, Tailwind utility classes
