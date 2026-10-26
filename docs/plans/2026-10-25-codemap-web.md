# Implementation plan

1. Preserve dirty CLI changes; record approved design and preview on Higgsfield using sample data. No community publishing.
2. Write failing server/security/CLI behavior tests before implementation. Move existing renderer/contracts to packages/web; preserve useful tests and remove Electron-only workspace commands.
3. Build Node HTTP + SSE server in CLI with worker, bootstrap snapshot, schema validation, same-origin session cookie, canonical filesystem boundaries, Git diff and background local graph index.
4. Build browser API adapter and Vite/Monaco assets; auto-attach workspace; make Graph/Chat/Changes work without desktop bridge. Apply reviewed prototype UX and animated intro with reduced motion.
5. Package web and worker into CLI; update scripts, lockfile, CI/publish/docs. Remove Desktop/Electron only after web parity checks.
6. Run focused tests/build/typecheck and fix failures. Independently review spec compliance then code quality. Pack/install/run outside monorepo; open local browser at 1440/1024/390. Preserve unrelated changes and refresh index if tools available.

Public interfaces: codemap web [path] [--port 4747] [--no-open]; GET /api/bootstrap, POST /api/command, GET /api/events. API uses existing agent command/event shapes. Each SSE connection begins with a snapshot, ordinary events follow. Browser never automatically retries POST.
