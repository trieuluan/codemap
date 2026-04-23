# Database Schema Workflow

## Source of truth

- Drizzle schema files under `packages/api/src/db/schema/` are the source of truth for database structure.
- When adding or changing tables, columns, indexes, relations, or inferred DB types, update the schema files only.
- Do not hand-write migration SQL files in `packages/api/drizzle/` or any generated migrations folder unless the user explicitly asks for a manual migration.

## Migration generation

- After schema changes, tell the user to run:

```bash
npm --workspace=@codemap/api run db:generate
npm --workspace=@codemap/api run db:migrate
```

- If verification requires checking migration generation, run `db:generate` only when the user asks or approves it.
- Do not edit Drizzle `_journal.json` manually unless repairing a migration issue the user explicitly requests.

## Better Auth schema

- If a Better Auth plugin needs database tables, model the required tables in `packages/api/src/db/schema/auth-schema.ts` so Drizzle can generate migrations from the repo schema.
- Prefer keeping plugin tables in the same schema area as Better Auth core tables unless there is a strong domain reason to split them.
