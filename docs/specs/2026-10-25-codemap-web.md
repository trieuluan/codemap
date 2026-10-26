# CodeMap Web

Approved design: replace Electron with a local browser workspace launched by `codemap web [path] [--port 4747] [--no-open]`. One real workspace per server; loopback only. Graph, agent chat, editable code, working diff, approvals, models, MCP and account remain available. Graph must work without LLM setup.

Higgsfield owns the sample-data UX prototype at website id `0002ab71-fdf2-49f0-bccb-043eea1607dd` (`codemap-web-preview`). Animated scroll-scrub intro follows graph → agent → diff, supports skip/reduced motion. Deploy a preview link; do not publish to community. No source or credentials are uploaded. Prototype deployed at https://codemap-web-preview.higgsfield.app and approved by the user. The user approved the exact 195-credit Cinema Studio Video 3.0 15s/1080p/16:9/audio-off generation, which completed successfully. Final port reuses the approved visuals and local assets. Production retains React Flow, Monaco and runtime contracts.

## Architecture

Move desktop renderer/shared browser contracts to packages/web. Keep `window.codemap` with renamed CodeMapApi; replace Electron IPC with authenticated same-origin HTTP commands and SSE events. GET /api/bootstrap returns workspace, status, redacted settings and authoritative session snapshot. SSE always starts with an authoritative snapshot, including after reconnect. Never replay mutation requests automatically.

CLI owns Node HTTP server and isolated runtime child process. Reuse existing utility logic and runtime-node, local SQLite graph, session reducer and request tracker. Remove native folder selection/workspace switching. Index background startup/retry independent of model initialization. Read/write/static file access must remain within canonical roots including symlink checks. Validate Host/Origin, session cookie, commands and body limits. Bind 127.0.0.1. Reject pending requests on child exit, clean processes/watchers/SSE on signals.

## Distribution

Vite builds self-contained frontend including Monaco workers. CLI build includes dist/web plus a separately bundled worker. Installed package resolves files relative to itself, never source checkout. Update workspace scripts, lockfile, CI/publish and help/docs, then remove all Electron-only files and dependencies. Preserve existing uncommitted 9router changes.

## Acceptance

CLI path/port/no-open/help failures are useful. Graph, chat, approvals and changes survive navigation/reload/reconnect without duplicate commands. Missing index has progress/retry. Files, renamed/deleted/untracked diffs and unborn Git work. Browser inspected at 1440/1024/390 with keyboard/reduced motion and no missing assets. Build/typecheck/relevant tests pass, npm package tested outside monorepo. Review diff and refresh index when available.
