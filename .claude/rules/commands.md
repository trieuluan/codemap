# Dev Commands

## Start servers

```bash
npm run dev              # API + Web in parallel
npm run dev:api          # Fastify API — port 3001
npm run dev:web          # Next.js web — port 3000
npm run dev:workers      # BullMQ workers (import + parse) in watch mode
npm run dev:worker:parses  # parse worker only
```

## Database (run from repo root)

```bash
npm --workspace=@codemap/api run db:generate  # generate migration from schema changes
npm --workspace=@codemap/api run db:migrate   # apply migrations
npm --workspace=@codemap/api run db:push      # push schema directly (dev only)
npm --workspace=@codemap/api run db:seed      # seed admin user
```

## Build & Test

```bash
npm run build:shared  # MUST run before building api or web
npm run build:api
npm run build:web
npm run test:api      # compiles TS then runs node:test suite
```

## Docker

```bash
docker compose -f compose.dev.yml up
```

Services: `workspace`, `worker`, `postgres`, `redis`.
Inside the container use `postgres` and `redis` as hostnames, not `localhost`.
