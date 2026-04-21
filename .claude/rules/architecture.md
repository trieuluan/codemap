# Architecture Overview

## Monorepo packages

- `packages/api` — Fastify 5 backend
- `packages/web` — Next.js 16 App Router frontend
- `packages/shared` — shared TypeScript types consumed by `web`

`shared` must be built before `api` or `web`. It is referenced as a `file:` dependency in `web/package.json`.

## Backend — `packages/api`

**Plugin load order** (`src/plugins/`, via `@fastify/autoload`):

`01.env` → `02.cors` → `03.helmet` → `04.db` → `05.better-auth` → `06.redis` → `07.error-handler` → `08.response` → `09.auth-session` → `10.admin-queues`

**Module structure** (`src/modules/`):

```
project/
  controller.ts   # thin HTTP handlers — delegates to service
  service.ts      # business logic, ownership checks, state transitions
  schema.ts       # Zod request/response schemas

project-import/
  runner.ts                # orchestrates full import pipeline end-to-end
  repository-source.ts     # resolve/validate/materialize repo source
  repository-workspace.ts  # staged + retained workspace management
  tree-builder.ts          # scan filesystem, build file tree
  map-persistence.ts       # persist project_map_snapshot
  file-preview.ts          # file content preview
  repo-parse-graph.ts      # graph queries: insights, search, dependency graph
```

**Two-stage async pipeline:**

1. `project-import.worker.ts` — clones repo, scans file tree, persists snapshot, enqueues parse job
2. `project-parse.worker.ts` — extracts symbols, relationships, import edges, persists to `repo-parse-schema` tables

Both workers are separate processes connected to BullMQ via Redis. Queue names come from env vars (`IMPORT_QUEUE_NAME`, `PARSE_QUEUE_NAME`).

**Database schema** (`src/db/schema/`):

- `auth-schema.ts` — Better Auth tables
- `project-schema.ts` — `project`, `project_import`, `project_map_snapshot`
- `repo-parse-schema.ts` — `repo_file`, `repo_symbol`, `repo_symbol_occurrence`, `repo_symbol_relationship`, `repo_import_edge`, `repo_external_dependency`

**Local storage:** cloned repos stored under `CODEMAP_STORAGE_ROOT` (maps to `.codemap-storage/` in dev compose).

## Frontend — `packages/web`

**Route groups:**

- `app/(auth)/` — login, signup, forgot-password (unauthenticated)
- `app/(protected)/` — dashboard, projects, project detail, project map (requires session)

**Feature directories** (`features/projects/`):

- `api/` — typed project endpoint client + response/input types
- `components/` — badges/date components shared inside the project feature
- `utils/` — project formatters and helper functions
- `hooks/` — project-level hooks reserved for feature-wide reuse
- `list/` — project list view; nested `components/` for list dialogs/cards/skeletons
- `detail/` — project overview view; nested `components/` for edit/history/skeleton UI
- `map/` — code explorer, insights, and graph (see `ui-map.md` for layout detail)

**API client** (`lib/api/`):

- `client.ts` — base `requestApi` helper with cookie forwarding for SSR

**Project API layer** (`features/projects/api/`):

- `projects.ts` — typed functions for all project endpoints (`createServerProjectsApi` for SSR, `browserProjectsApi` for client)
- `projects.types.ts` — all project API response/input types
- `index.ts` — feature API barrel

Server Components forward cookies via `cookieHeader`. Client Components use browser fetch (cookies sent automatically).

**Data fetching:** SWR for client-side polling. Server Components fetch directly in `page.tsx`.
