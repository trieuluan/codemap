# CodeMap Monorepo

CodeMap is a monorepo for mapping, analyzing, and understanding codebases.

The project currently includes:

- `packages/api`: Fastify backend API
- `packages/web`: Next.js frontend
- `packages/shared`: shared TypeScript contracts and utilities

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
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI

### Shared

- shared TypeScript types
- shared auth-related schemas

## Repository Structure

```text
packages/
├── api/
│   └── src/
│       ├── config/
│       ├── db/
│       ├── lib/
│       ├── plugins/
│       ├── routes/
│       └── server.ts
├── web/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── hooks/
│   └── lib/
└── shared/
    └── src/
```

## Workspace Scripts

Run these commands from the repository root:

```bash
npm install
```

### Development

Run both apps:

```bash
npm run dev
```

Run backend only:

```bash
npm run dev:api
```

Run frontend only:

```bash
npm run dev:web
```

### Build

Build shared package:

```bash
npm run build:shared
```

Build backend:

```bash
npm run build:api
```

Build frontend:

```bash
npm run build:web
```

### Run Production

Start backend:

```bash
npm run start:api
```

Preview frontend:

```bash
npm run preview:web
```

### Tests

Run API tests:

```bash
npm run test:api
```

## Backend Notes

- Fastify plugins are autoloaded from `packages/api/src/plugins`
- API routes are autoloaded from `packages/api/src/routes`
- Better Auth is mounted under `/api/auth/*`
- Session data is attached to incoming requests by the auth session plugin
- Drizzle schema currently contains the Better Auth tables for users, sessions, accounts, and verification tokens

## Frontend Notes

- The frontend uses Next.js App Router
- Route files live under `packages/web/app`
- Reusable UI components live under `packages/web/components`
- Feature-oriented UI and flows live under `packages/web/features`
- The auth client is configured in `packages/web/lib/auth-client.ts`

## Environment Variables

The backend validates environment variables with Zod. Current required values include:

```env
API_PORT=3001
WEB_PORT=3000
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=your-secret-with-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3001
```

Notes:

- the repository may use a root `.env`
- backend env loading is handled explicitly from the monorepo root
- if running inside Docker or a devcontainer, service hostnames should be used instead of assuming `localhost`

## Architecture Guidelines

- keep backend business logic out of route handlers
- keep frontend components focused and reusable
- put shared contracts in `packages/shared`
- avoid circular dependencies between packages
- prefer explicit, type-safe code over clever abstractions

## Current Status

The repository already includes:

- landing page and dashboard UI
- authentication UI flows
- Better Auth backend integration
- shared auth request schemas

Likely next areas of growth:

- protected dashboard flows with real session checks
- project/codebase analysis features
- richer API and dashboard functionality

## Admin Bootstrap

The API package supports a manual admin seed flow with Drizzle and Better Auth.

Configure these root env values:

```env
ADMIN_EMAIL=admin@codemap.local
ADMIN_PASSWORD=admin12345
ADMIN_NAME=CodeMap Admin
```

Then run:

```bash
npm --workspace=@codemap/api run db:migrate
npm --workspace=@codemap/api run db:seed
```

Notes:

- `db:seed` is idempotent and safe to rerun
- the admin user is created through Better Auth's email/password flow
- the script ensures the seeded admin has the `admin` role
