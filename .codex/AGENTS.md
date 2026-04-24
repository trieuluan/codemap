# AGENTS.md

## Project Overview

CodeMap is a monorepo-based developer tool for mapping, analyzing, and understanding codebases.

The project currently consists of:

- `packages/api`: Fastify backend
- `packages/web`: Next.js frontend
- `packages/shared`: shared types and utilities

Main goals:

- provide authentication
- analyze project/codebase structure
- present results in a clean web UI
- keep the architecture simple, modular, and type-safe

---

## Session Bootstrap

When starting a new Codex session in this repo, load the repo rules first before making architectural, UI, or data-model changes.

### Rule aliases

Use these short aliases mentally when navigating the repo instructions:

- `@arch` → `.claude/rules/architecture.md`
- `@routes` → `.claude/rules/ui-routes.md`
- `@map` → `.claude/rules/ui-map.md`
- `@conv` → `.claude/rules/conventions.md`
- `@db` → `.claude/rules/database-schema.md`
- `@mcp` → `.claude/rules/mcp-first.md`

### Minimum read order

For most tasks, read in this order:

1. `@arch`
2. `@conv`
3. `@mcp`

Then add task-specific rules as needed:

- UI / route work → `@routes`
- project map / explorer / graph work → `@map`
- DB schema or Better Auth table changes → `@db`

### MCP-first exploration

Inside `codemap`, prefer MCP tools before direct file reads:

1. `search_codebase`
2. `get_file`
3. `get_project_map`
4. direct file reads / shell search only when MCP is not enough

### Skill / plugin hints

If the capability exists in the session, prefer:

- `openai-docs` for OpenAI product/API questions
- GitHub plugin skills/tools for PR, issue, or CI work
- Computer Use only for explicit browser/UI side effects

Local repo skill references:

- confirm-before-edit → `.claude/skills/confirm-before-edit/SKILL.md`
  Use before edits that have non-obvious consequences or when you need to pause and realign with the user on a risky change.

Do not assume every skill is available in every session; use them only when present and relevant.

---

## Tech Stack

### Backend
- Fastify
- TypeScript
- Drizzle ORM
- PostgreSQL
- Better Auth
- Zod

### Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI

### Shared
- shared TypeScript types
- shared auth-related contracts when needed

---

## Monorepo Structure

packages/
  api/       # Fastify backend
  web/       # Next.js frontend
  shared/    # shared code

General rules:

- backend-only code must stay inside `packages/api`
- frontend-only code must stay inside `packages/web`
- reusable contracts/types can go into `packages/shared`
- avoid circular dependencies between packages

---

## Architecture Principles

- prefer simple, explicit code over clever abstractions
- keep business logic out of route handlers and UI components
- prioritize readability and maintainability
- use strongly typed schemas and validated inputs
- keep files focused on a single responsibility
- favor composition over inheritance
- avoid premature abstraction

---

## Backend Rules

### General
- use Fastify plugins/modules structure
- keep route handlers thin
- move business logic into services
- validate request input with Zod
- return predictable response shapes
- prefer async/await
- handle errors explicitly

### Suggested module structure

modules/
  auth/
    controller.ts
    service.ts
    schema.ts

### Backend conventions
- controller.ts handles HTTP layer
- service.ts handles domain/business logic
- schema.ts contains Zod schemas and DTO-like definitions
- db access should be centralized and clean
- avoid putting raw SQL or heavy query logic directly in route files

### Database
- use Drizzle ORM
- PostgreSQL is the source of truth
- schema definitions should be clear and normalized
- migrations must be kept consistent and committed
- never assume environment variables are loaded automatically in scripts
- when needed, explicitly load .env in script/config files

### Auth
- use Better Auth
- prefer session/cookie-based auth where applicable
- protect private routes and dashboard access properly
- unauthenticated users should be redirected away from protected pages
- auth-related logic should be centralized, not duplicated

---

## Frontend Rules

### General
- use Next.js App Router conventions
- use client components only when necessary
- default to server components unless client interactivity is needed
- keep UI components reusable and small
- separate presentation from stateful logic when reasonable

### UI
- use shadcn/ui patterns
- use Tailwind utility classes
- use Radix primitives when needed
- keep styling consistent with the current design system
- use cn() for class merging
- avoid inline styles unless absolutely necessary

### Component conventions
- prefer clear props over overly generic abstractions
- keep form logic understandable
- show loading, error, and empty states
- use toast notifications for user-facing async feedback
- destructive/error toast must use destructive variant

### Forms
- disable submit buttons while submitting
- always handle loading and error UI
- surface backend errors to users in a friendly way
- do not silently swallow errors

---

## TypeScript Rules

- use strict TypeScript-friendly patterns
- avoid any
- prefer explicit types for public functions
- infer when it improves readability, not when it hides intent
- keep shared types centralized when reused across packages
- prefer narrow and precise types

---

## Validation Rules

- use Zod as the primary validation layer
- validate environment variables
- validate request payloads
- validate query params and route params where needed
- keep validation schemas close to the module they belong to

---

## Environment Rules

- environment variables may live at the monorepo root
- do not assume tools like Drizzle automatically read root .env
- explicitly load env files in scripts/configs when necessary
- in Docker/devcontainer environments:
  - localhost inside a container is the container itself
  - use service names like postgres or redis for connections

---

## Docker / Devcontainer Notes

- project runs in devcontainers
- container runtime env and .env file loading are different concerns
- changing .env requires restarting app or recreating container, not rebuilding image
- rebuild only when Dockerfile or devcontainer config changes
- database host should be postgres inside container

---

## Code Style

- prefer descriptive names
- avoid deeply nested logic
- extract helper functions when it improves clarity
- avoid unnecessary abstractions
- keep imports organized
- avoid dead/commented code

---

## When Making Changes

1. determine correct package (api/web/shared)
2. preserve architecture
3. keep changes minimal and complete
4. maintain consistency

### Bug Fixing

- identify root cause
- fix cause, not symptom
- check related flows

### Adding Features

- define clear boundaries
- validate inputs
- handle loading/success/error states

---

## Preferred Patterns

### Good
- thin controller + service
- Zod validation
- reusable UI
- clear async states

### Avoid
- business logic in routes
- API logic in UI components
- duplicated validation
- magic abstractions
- wrong Docker networking assumptions

---

## Output Expectations for Agents

- respect monorepo boundaries
- use TypeScript
- use Zod, Drizzle, Better Auth
- use shadcn/ui + Tailwind
- produce ready-to-use code
- include error handling
- keep solutions simple and consistent
