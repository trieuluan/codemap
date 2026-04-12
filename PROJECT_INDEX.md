# Project Index

## Overview

CodeMap is a TypeScript monorepo for mapping and understanding codebases.

- `packages/api`: Fastify backend API
- `packages/web`: Next.js frontend
- `packages/shared`: shared TypeScript contracts

## Root Workspace

Main files:

- `README.md`: high-level project guide
- `compose.dev.yml`: dev container + Postgres + Redis
- `compose.yml`, `compose.prod.yml`: other deployment variants
- `Dockerfile`: image build entry
- `.env.example`: local environment template
- `package.json`: workspace scripts

Root scripts:

- `npm run dev`: run API + web in parallel
- `npm run dev:api`: run backend only
- `npm run dev:web`: run frontend only
- `npm run build:api`: build shared then API
- `npm run build:web`: build shared then web
- `npm run test:api`: run API tests

## Runtime Topology

Development services from `compose.dev.yml`:

- `workspace`: main dev container mounted at `/workspace`
- `postgres`: PostgreSQL 18
- `redis`: Redis 8

Default ports:

- Web: `3000`
- API: `3001`
- Postgres: `5432`
- Redis: `6379`

Notes:

- `DATABASE_URL` in `.env.example` points to container hostname `codemap_pg`
- `REDIS_URL` is injected in dev compose, but Redis is not yet a visible app dependency in the scanned code

## Backend

Location: `packages/api`

Stack:

- Fastify 5
- TypeScript
- Drizzle ORM
- PostgreSQL
- Better Auth
- Zod

Important entry points:

- `src/server.ts`: starts Fastify and listens on `API_PORT`
- `src/app.ts`: loads env, configures logger, autoloads plugins and routes
- `src/config/env.ts`: validates core env vars with Zod
- `src/lib/auth.ts`: Better Auth configuration

Plugin flow:

- `src/plugins/01.env.ts` to `09.auth-session.ts`: autoloaded in filename order
- `src/plugins/05.better-auth.ts`: mounts auth handler at `/auth/*`
- `src/plugins/09.auth-session.ts`: attaches session to each request via Better Auth

API routes:

- `src/routes/root.ts`
- `src/routes/auth/index.ts`
- `src/routes/example/index.ts`
- `src/routes/projects/index.ts`

Projects API currently exposes:

- `POST /projects`
- `GET /projects`
- `GET /projects/:projectId`
- `PATCH /projects/:projectId`
- `DELETE /projects/:projectId`
- `POST /projects/:projectId/import`
- `GET /projects/:projectId/imports`

Project module structure:

- `src/modules/project/controller.ts`: HTTP handlers
- `src/modules/project/service.ts`: business logic
- `src/modules/project/schema.ts`: request/response validation

Current backend domain model:

- `project`
- `project_import`
- Better Auth tables from `auth-schema.ts`

Project lifecycle values:

- Visibility: `private | public | internal`
- Status: `draft | importing | ready | failed | archived`
- Provider: `github`
- Import status: `pending | running | completed | failed`

Current project service behavior:

- Generates unique slugs from project names
- Restricts project access by owner user id
- Records import history
- Marks a project as `importing` when import is triggered

## Frontend

Location: `packages/web`

Stack:

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui + Radix

Important files:

- `app/page.tsx`: landing page
- `app/(auth)/*`: auth pages
- `app/(protected)/dashboard/page.tsx`: dashboard UI
- `app/(protected)/projects/page.tsx`: projects list
- `app/(protected)/projects/[projectId]/page.tsx`: project detail
- `app/(protected)/projects/[projectId]/map/page.tsx`: project mapping page
- `lib/api/projects.ts`: typed project API client
- `lib/auth-client.ts`: Better Auth React client

Feature folders:

- `features/auth`: login/signup/forgot password flows
- `features/dashboard`: dashboard widgets and navigation
- `features/projects/list`: project list/create/delete
- `features/projects/detail`: project detail and edit flows
- `features/projects/map`: map shell, file tree explorer, import progress
- `features/projects/shared`: shared project badges/helpers

Frontend data flow:

- Server components use `cookies()` and forward the cookie header to API requests
- `lib/api/projects.ts` talks to `NEXT_PUBLIC_API_URL` or `API_INTERNAL_URL`
- Browser requests use `credentials: include`

## Shared Package

Location: `packages/shared`

Purpose:

- shared auth-related types
- shared TypeScript exports consumed by other packages

## Environment

Important env vars observed:

- `NODE_ENV`
- `API_PORT`
- `WEB_PORT`
- `HOST`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`

Implementation note:

- `env.ts` validates `CORS_ORIGIN`, but `lib/auth.ts` reads `CORS_ORIGINS`
- this mismatch may cause trusted origin config drift

## Tests And Migrations

- API tests live in `packages/api/test`
- Drizzle migrations live in `packages/api/drizzle`
- Admin bootstrap/seed script lives in `packages/api/src/scripts/seed.ts`

## Current Product Shape

What already exists:

- landing page
- auth flows
- dashboard shell
- project CRUD
- project import history
- project mapping UI scaffold

What looks incomplete or still scaffolded:

- dashboard uses placeholder content like `userName="John"`
- Redis is provisioned but not clearly wired into app logic yet
- project import flow marks imports as running, but scanned code does not yet show an async worker/import pipeline
- landing page links to `/docs`, but no matching docs route was visible in the scanned files

## Good Starting Points

If continuing backend work:

- `packages/api/src/modules/project/service.ts`
- `packages/api/src/db/schema/project-schema.ts`
- `packages/api/src/lib/auth.ts`

If continuing frontend work:

- `packages/web/features/projects/map/project-map-shell.tsx`
- `packages/web/features/projects/list/project-list.tsx`
- `packages/web/lib/api/projects.ts`

