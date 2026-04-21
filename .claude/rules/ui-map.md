---
paths: "packages/web/features/projects/map/**"
---

# Map Feature — Layout & Components

## 3-column Code Explorer (`/projects/[id]/map`)

Fixed height (`h-[760px]`):

```
┌─────────────────────┬──────────────────────────┬─────────────────────┐
│  Left sidebar       │  Center: file viewer      │  Right: detail panel│
│  (320px fixed)      │  (code with syntax hl.)   │  (3 tabs)           │
│                     │                           │                     │
│  Filter tree:       │  File name + badges:      │  Details tab:       │
│  - text search      │  extension, kind, MIME,   │  Classification,    │
│  - kind dropdown    │  size                     │  Technical info,    │
│  - language dropdown│                           │  Repository path    │
│                     │  "Read-only code viewer"  │                     │
│  Files tree         │  label + syntax-colored   │  Relationships tab: │
│  (react-arborist)   │  source                   │  Imports (count),   │
│                     │                           │  Imported by (count)│
│                     │                           │                     │
│                     │                           │  Analysis tab:      │
│                     │                           │  Totals, Symbols,   │
│                     │                           │  Top files by deps  │
└─────────────────────┴──────────────────────────┴─────────────────────┘
```

## Key component files

| File | Role |
|---|---|
| `explorer/project-map-shell.tsx` | Root client component — owns explorer composition, selection, expanded nodes, and SWR fetches |
| `explorer/components/project-map-sidebar.tsx` | Left sidebar: filter controls + FileTree |
| `explorer/components/file-tree-explorer.tsx` | `react-arborist` tree; node `id` = `node.path \|\| node.name` |
| `explorer/utils/file-tree-model.ts` | Tree transform + filter utils; deduplicates children by path in `mapProjectTreeToRepositoryNode` |
| `explorer/components/detail-panel.tsx` | Right panel — Details / Relationships / Analysis tabs |
| `explorer/components/project-file-viewer.tsx` | Center code viewer (Monaco) |
| `explorer/components/project-map-search-dialog.tsx` | `⌘K / Ctrl+K` global search (files + symbols + exports) |
| `components/project-map-nav.tsx` | Mapping / Insights / Graph tab navigation |
| `insights/project-map-insights-view.tsx` | Insights page content |
| `graph/project-map-graph-view.tsx` | Graph page — filter sidebar + dynamic React Flow canvas |
| `graph/utils/graph-layout.ts` | Pure graph layout utility for folder, structure, and file focus modes |
| `graph/components/graph-node.tsx` | `FileNode` custom React Flow node with language badge + cycle ring |
| `graph/components/graph-canvas.tsx` | React Flow canvas (dynamic-imported, SSR-safe) — MiniMap + Controls |
