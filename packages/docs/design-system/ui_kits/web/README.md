# CodeMap Web — UI Kit

High-fidelity React recreation of the CodeMap web app. Open `index.html` for an interactive click-through that mirrors the real `packages/web` shell — fixed left sidebar, sticky top bar, and 5 connected screens.

## Files

| File | Role |
|---|---|
| `index.html` | App shell + router. Loads React 18, Babel standalone, Lucide, then mounts `<App>` |
| `app.jsx` | Top-level shell: `Sidebar`, `Header`, route switch |
| `primitives.jsx` | `Button`, `Badge`, `Card`, `Input`, `Empty`, `Avatar`, `Icon` — token-faithful shadcn equivalents |
| `sidebar.jsx` | Fixed left nav with active-route highlight |
| `header.jsx` | Sticky top bar — search, bell, avatar dropdown |
| `dashboard.jsx` | `/dashboard` — welcome, stats grid, onboarding cards, recent activity, quick actions |
| `projects.jsx` | `/projects` — search, filter, project cards with status |
| `project-detail.jsx` | `/projects/:id` — header w/ status, latest import, repository meta, import history, quick actions |
| `project-map.jsx` | `/projects/:id/map` — 3-tab nav, status banner, 3-column code explorer (filter / file viewer / detail panel) |
| `settings.jsx` | `/dashboard/settings` — sidebar nav (Account / API Keys / Team / Billing) + danger zone |

## What's faithful

- Tokens lifted verbatim from `_source/app/globals.css` via `colors_and_type.css`
- Sidebar/header structure matches `_source/features/dashboard/{sidebar,header}.tsx`
- Settings layout follows the user's brief: section nav (Account, API, Team, Billing), form controls, danger zone — drawn in CodeMap's vocabulary, not invented
- Map view follows `.claude/rules/ui-map.md` exactly: 320px filter sidebar, fixed `h-[760px]`, 3 tabs in the right panel

## What's intentionally simpler

- Auth client / SWR / Better Auth are stubbed — no network calls
- React-Arborist file tree is a hand-rolled lightweight equivalent
- Monaco code viewer is replaced by a syntax-tinted `<pre>` block
- React Flow graph is a static schematic; interactive Graph view is shown as a diagram, not a real graph engine
