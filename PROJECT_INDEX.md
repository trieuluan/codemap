# Project Index

## Overview

CodeMap is a TypeScript monorepo for importing repositories, indexing their file trees, and browsing the resulting project map.

- `packages/api`: Fastify API, auth, persistence, import queue, worker
- `packages/web`: Next.js App Router frontend for auth, dashboard, projects, and map explorer
- `packages/shared`: shared TypeScript package consumed by the web app

## Root Workspace

Main files:

- `README.md`: high-level project guide
- `package.json`: workspace scripts
- `compose.dev.yml`: local dev stack with workspace, Postgres, and Redis
- `compose.yml`, `compose.prod.yml`: non-dev compose variants
- `Dockerfile`: image build entrypoint
- `.env.example`: baseline environment template

Root scripts:

- `npm run dev`: run API and web in parallel
- `npm run dev:api`: run backend only
- `npm run dev:web`: run frontend only
- `npm run dev:worker`: run the project import worker in watch mode
- `npm run build:shared`: build the shared package
- `npm run build:api`: build shared, then API
- `npm run build:web`: build shared, then web
- `npm run start:api`: start the built API
- `npm run start:worker`: start the import worker once
- `npm run test:api`: build and run API tests

## Runtime Topology

Primary local services:

- Web app on `WEB_PORT` (default `3000`)
- API on `API_PORT` (default `3001`)
- PostgreSQL on `5432`
- Redis on `6379`
- BullMQ worker consuming repository import jobs from Redis

High-level flow:

1. User creates or updates a project with a repository URL.
2. API creates a `project_import` record and enqueues a BullMQ job.
3. Worker clones/materializes repository source, scans the file tree, and persists a snapshot.
4. Frontend loads imports plus the latest map snapshot and lets users browse file metadata/content.

## Backend

Location: `packages/api`

Stack:

- Fastify 5
- TypeScript
- Drizzle ORM
- PostgreSQL
- Better Auth
- BullMQ
- Redis / ioredis
- Zod
- simple-git

Important entry points:

- `src/server.ts`: starts Fastify
- `src/app.ts`: builds the Fastify app, loads plugins/routes
- `src/config/env.ts`: validates environment variables
- `src/lib/auth.ts`: Better Auth configuration
- `src/lib/project-import-queue.ts`: BullMQ queue creation/enqueue helpers
- `src/workers/project-import.worker.ts`: standalone import worker process

Plugin load order:

- `src/plugins/01.env.ts`: parse env and attach config
- `src/plugins/02.cors.ts`
- `src/plugins/03.helmet.ts`
- `src/plugins/04.db.ts`
- `src/plugins/05.better-auth.ts`
- `src/plugins/06.redis.ts`
- `src/plugins/07.error-handler.ts`
- `src/plugins/08.response.ts`
- `src/plugins/09.auth-session.ts`
- `src/plugins/10.admin-queues.ts`

Route modules:

- `src/routes/root.ts`
- `src/routes/auth/index.ts`
- `src/routes/example/index.ts`
- `src/routes/projects/index.ts`

Projects API surface:

- `POST /projects`
- `GET /projects`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`
- `DELETE /projects/:projectId`
- `POST /projects/:projectId/import`
- `POST /projects/:projectId/imports/:importId/retry`
- `GET /projects/:projectId/imports`
- `GET /projects/:projectId/map`
- `GET /projects/:projectId/map/files/content`
- `GET /projects/:projectId/map/files/raw`

Project domain modules:

- `src/modules/project/controller.ts`: HTTP handlers
- `src/modules/project/service.ts`: CRUD, ownership checks, import state transitions, snapshot lookup
- `src/modules/project/schema.ts`: Zod request/response schemas

Import pipeline modules:

- `src/modules/project-import/repository-source.ts`: validate and resolve repository source
- `src/modules/project-import/github-source.ts`: GitHub-specific source handling
- `src/modules/project-import/repository-workspace.ts`: staged and retained workspace management
- `src/modules/project-import/tree-builder.ts`: filesystem tree scan/build
- `src/modules/project-import/map-persistence.ts`: persist project map snapshots
- `src/modules/project-import/file-preview.ts`: file content preview support
- `src/modules/project-import/runner.ts`: end-to-end import execution

Current backend behavior:

- Projects are user-owned and filtered by `ownerUserId`
- Slugs are normalized and deduplicated
- Imports record progress/status and can be retried
- Successful imports persist both a file-tree snapshot and retained source workspace metadata
- New successful imports clean up the previously retained workspace when possible

Core persistence models:

- `project`
- `project_import`
- `project_map_snapshot`
- Better Auth tables from `auth-schema.ts`

Observed lifecycle values:

- Project visibility: `private | public | internal`
- Project status: `draft | importing | ready | failed | archived`
- Provider: currently `github`
- Import status: `pending | running | completed | failed`

## Frontend

Location: `packages/web`

Stack:

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui + Radix UI
- SWR for client fetching

Important app routes:

- `app/page.tsx`: landing page
- `app/(auth)/auth/page.tsx`: login
- `app/(auth)/auth/signup/page.tsx`
- `app/(auth)/auth/forgot-password/page.tsx`
- `app/(protected)/dashboard/page.tsx`
- `app/(protected)/projects/page.tsx`
- `app/(protected)/projects/[projectId]/page.tsx`
- `app/(protected)/projects/[projectId]/map/page.tsx`

Project-related frontend areas:

- `features/projects/list/*`: create, list, and delete project flows
- `features/projects/detail/*`: project overview, edit, import history
- `features/projects/map/*`: import status banner, file tree explorer, detail panel, file viewer
- `features/projects/shared/*`: badges, formatting, shared helpers
- `lib/api/projects.ts`: typed API client for project CRUD/import/map endpoints

Frontend data flow:

- Protected routes forward cookies to the API for authenticated requests
- Project detail page loads project metadata and import history
- Project map page loads the latest `project_map_snapshot`
- `ProjectMapShell` supports tree expansion, search, kind/language filters, and file content fetching

## Shared Package

Location: `packages/shared`

Purpose:

- shared TypeScript exports
- shared contracts reused by other packages

## Environment

Important env vars confirmed in code:

- `API_PORT`
- `WEB_PORT`
- `HOST`
- `NODE_ENV`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `REDIS_URL`
- `IMPORT_QUEUE_NAME`
- `CODEMAP_STORAGE_ROOT`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

Additional bootstrap vars referenced in docs:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

## Tests, Data, And Infra

- API tests live in `packages/api/test`
- Drizzle migrations live in `packages/api/drizzle`
- Admin seed script lives in `packages/api/src/scripts/seed.ts`
- Dev compose provisions Postgres and Redis for the API plus import queue

## Current Product Shape

What exists now:

- auth flows
- dashboard shell
- project CRUD
- import history UI
- repository import queue + worker
- persisted project map snapshots
- file tree browsing and file content viewing

What still looks like active build-out:

- dashboard content is still partly placeholder/demo content
- provider support appears GitHub-first
- raw/source browsing depends on retained local workspace storage
- production/ops wiring for long-running workers is present in scripts but likely still evolving

## Good Starting Points

Backend:

- `packages/api/src/modules/project/service.ts`
- `packages/api/src/modules/project-import/runner.ts`
- `packages/api/src/lib/project-import-queue.ts`
- `packages/api/src/workers/project-import.worker.ts`

Frontend:

- `packages/web/app/(protected)/projects/[projectId]/map/page.tsx`
- `packages/web/features/projects/map/project-map-shell.tsx`
- `packages/web/lib/api/projects.ts`
