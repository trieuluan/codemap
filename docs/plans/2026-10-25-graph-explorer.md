# Graph-first explorer implementation

1. Add tested graph scope helper (all/1/2 hops plus path roles); all scope must keep every node when selection changes, filter edges to visible endpoints.
2. Simplify CodeMapPanel to a stable complete file graph with cancellable ELK layout, selected-node camera focus after canvas/panel settling, read-only Streamdown code previews, pin/unpin snapshots and incoming/outgoing navigation. Preserve cycle indication, exports, index states, retry and viewport controls.
3. Wire typed scope/role props from App through MapPage; Explorer/Filters tabs in MapFileSidebar. Explorer selection resets filters/search and closes mobile tree. Keep collapsed explorer state and persistent agent.
4. Replace obsolete selection/editor CSS with left inspector, compact snippet cards and responsive overlays. Remove unused draft helper/tests once Graph no longer edits source.
5. Run web tests, web/CLI tsc and CLI build; review diffs and browser graph/explorer/inspector/chat/changes behavior at 1440,1024,390. Pack asset check and refresh local index.

No new dependencies or cloud generation. User approved execution; do not pause for another design approval.

## Verification result

- Web and CLI TypeScript pass; CLI/Vite build passes; 39 web tests pass.
- Reviewed graph scope, role navigation, keyboard selection and consumed explorer requests. Concrete review findings fixed.
- Browser checked 1440/1024/390, full graph selection, one-hop filtering, clearing incompatible roles on relation navigation, Enter activation, pin preview, read-only source, context handoff to agent and Working Changes. No console warning/error observed.
- npm pack contains dist/web/index.html, the ELK layout worker asset and dist/web-worker.js.
- Local index refresh request was not executed: automatic escalation review failed because the account reached its usage limit. Existing local watcher is running; explicit clean refresh remains outstanding. No cloud reimport requested for this UI-only change.

## Approved compact file clusters follow-up

User approved grouping file graph before adding a separate Symbols mode. Default graph aggregates files by monorepo package or top-level module. Expanding a cluster reveals its immediate submodules/files; Explorer and relation selection reveal the complete path automatically. Preserve cross-cluster imports as weighted aggregate edges without self edges. Explicit one/two hop scopes display files in a fresh compact local layout rather than retaining far-apart workspace coordinates. Smaller file marks and hover/selection labels reduce visual noise. Overview collapses modules again. This is a path-based grouping, not semantic community detection or symbol indexing.

Changes stay in graph-view.ts/tests, CodeMapPanel.tsx and graph-focus.css. Keep read-only inspector, pins, chat handoff, filters, export, keyboard selection and reduced motion. Verify unit tests, types/build, package worker assets, browser at 1440/1024/390 and review diff. No new dependencies.

Compact clusters verification: 43 web tests pass, web/CLI TypeScript and CLI/Vite build pass. Reviewer found no important blockers; minor unrelated root expansion was fixed and regression-tested. Browser checked 1440/1024/390: package expansion with Enter/click, Explorer reveal, reset Overview and compact one-hop scene. Pack includes web assets/ELK worker. Explicit local index refresh now succeeded (200), resolving the earlier approval-service blocker; clean workspace shows 460 indexed files summarized into 11 groups with 9 weighted cross-module links. No symbol graph or semantic community detection was introduced.

## Expand motion follow-up

Keep ReactFlow mounted with a painted scene snapshot while worker layout is pending; show a small nonblocking status badge. Tween positions for 320ms, spawn new nodes at the former parent, fade exiting nodes, and interpolate edge endpoints with node positions. Preserve viewport on expansion; explicit locate/Overview/filter actions may still move camera. User pan/drag cancels motion and queued camera movement; reduced motion applies targets immediately. Sync scene metadata separately when topology is unchanged. Added transition-origin regression tests; 45 web tests, web/CLI typechecks and build pass. Browser verified canvas stays present and viewport transform is unchanged after expansion.

## 2026-10-26 retained folder toggle

Retain expanded folder anchors and display a native +/- control with aria-expanded. Keep nested expansion choices when an ancestor closes; reopening restores them. Add distinct dotted contains edges (count=0), without inflating import link counts. Route mouse wrapper clicks and inner keyboard button activation once each; ignore ReactFlow cluster select events to prevent double toggles. Children animate from and back toward retained parents. Disable fading-out toggle buttons to remove them from tab navigation. Added regression tests for retained anchors, structural/import separation, nested collapse and retained-parent motion origins.
