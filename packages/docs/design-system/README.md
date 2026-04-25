# CodeMap Design System

CodeMap is a **dark-themed web application for mapping, analyzing, and understanding codebases.** Users connect a GitHub repository, CodeMap imports and indexes it in the background, and they explore the resulting project map — a 3-column code explorer (filter tree → file viewer → detail panel), an Insights view (top files, orphans, cycles), and a React-Flow dependency Graph view.

This design system is the canonical visual + interaction reference for every CodeMap surface.

## What's in here

| Path | What it is |
|---|---|
| `colors_and_type.css` | Single source of truth — colors (light + dark), type stack, scale, weights, spacing, radii, shadows, semantic aliases |
| `assets/` | Logo source + any imagery |
| `fonts/` | Font notes (Geist is loaded from Google Fonts CDN) |
| `preview/` | Card-sized HTML specimens registered to the Design System tab |
| `ui_kits/web/` | Interactive React recreation of the CodeMap web app — open `index.html`. Components: `sidebar.jsx`, `header.jsx`, `dashboard.jsx`, `projects.jsx`, `project-detail.jsx`, `project-map.jsx` (mapping + insights + graph), `settings.jsx` (account / api keys / team / billing + danger zone), `primitives.jsx` (shadcn-equivalent Button/Badge/Card/Input/Switch/Avatar). |
| `_source/` | Read-only mirror of `packages/web` from `trieuluan/codemap@master` — imported for reference. Real Next.js source — use this for production work. |
| `SKILL.md` | Cross-compatible skill definition for Claude Code / agent skills. Tells an agent how to use this folder. |

## Sources

- **GitHub repo:** [`trieuluan/codemap`](https://github.com/trieuluan/codemap) — branch `master`, package `packages/web` (Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui, Radix). Imported into `_source/` for direct lookup.
- **Internal rule files** (read for tone + layout truth): `.claude/rules/ui-routes.md`, `.claude/rules/ui-map.md`, `.claude/rules/tone-of-voice.md`, `PROJECT_INDEX.md`, root `README.md`.

## Product surfaces

CodeMap is a single product, but it has two distinct shells:

1. **Public marketing/auth shell** — landing page (`/`), sign-in (`/auth`), sign-up, forgot-password. Centered single-column, minimal chrome.
2. **Authenticated app shell** — fixed left sidebar (`bg-sidebar`, 256px), sticky top bar with search + bell + avatar, content area with `p-4 lg:p-6`. Houses Dashboard, Projects, Project Detail, Map (Mapping / Insights / Graph tabs), Settings.

The app shell is where 90% of the product lives, and it's the primary target of this design system.

## Brand summary

CodeMap looks like a **calm, high-density developer tool** — dark surfaces, neutral grays only, no brand color, square-ish cards with thin borders, almost no shadow. It treats text as the visual anchor: the typographic system carries hierarchy, not color blocks.

Geist (sans) for everything human, Geist Mono for everything machine — file paths, ids, badges, code. The logo is a literal map glyph: an axis chart with a route and a destination dot, drawn at 24×24 in `currentColor`.

## CONTENT FUNDAMENTALS

**Voice.** Professional, plain, present-tense. Reads like a clean product spec rather than marketing copy. The surface UI ships in **English** and addresses the user as "you" (mostly implicit — "Manage account defaults", not "You can manage…"). Section headers are noun phrases ("Recent Activity", "Quick Actions", "Getting started"). Buttons are imperative verbs ("Create API key", "Revoke", "Re-import", "Open mapping").

> Note: The repo's `tone-of-voice.md` rule is for Claude's chat replies inside the codebase (Vietnamese, IT-jargon-friendly). It does NOT govern product UI copy — UI copy is English. Don't confuse the two.

**Casing.** Sentence case for headings and buttons ("Create API key", not "Create API Key"). Title Case is reserved for proper-noun product names — CodeMap, MCP, GitHub, Better Auth.

**Pronouns.** "You" / "your" when explicit. Possessive often elided ("Map and understand your codebase" → hero, but section subheads usually drop it: "Manage account defaults and access credentials for CodeMap").

**Tense.** Present indicative for state ("No activity yet"), imperative for actions ("Get started", "Sign in to your account to continue").

**Specificity.** Always concrete. Empty states say _what_ goes there and _when_ it appears: "No activity yet — Your recent activity will appear here once you start using CodeMap." Never "Nothing here yet."

**Numbers + units.** Stats are bare numbers with a label below ("0" / "Projects"). Counts use thin hyphenation: "0 of 4 complete". File sizes / line counts unitized inline.

**Punctuation.** No trailing period on button labels or single-sentence card subtitles. Em-dashes used sparingly. Curly quotes preserved (`don't`, `'s`).

**Emoji.** **None.** Zero emoji anywhere in the product UI.

**Vibe.** Neutral, factual, slightly terse. Never playful, never enthusiastic. CodeMap behaves like a CLI that happens to have a UI.

### Examples lifted from the source

- Hero: "Map and understand your codebase" / "CodeMap helps teams visualize, analyze, and document their code. Get instant insights into your project structure and architecture."
- Dashboard welcome: "Welcome, John" / "Here's an overview of your workspace and getting started guide."
- Settings header: "Settings" / "Manage account defaults and access credentials for CodeMap."
- Empty: "No API keys yet — Create your first API key to use CodeMap from local tools and scripts."
- Login: "Welcome back" / "Sign in to your account to continue"

## VISUAL FOUNDATIONS

### Color
- **Dark-first.** The entire authenticated app uses the `.dark` token block. Light mode exists but is not the canonical experience.
- **Achromatic only.** Every base token in the dark theme is `oklch(L 0 0)` — pure neutrals from `oklch(0.07 0 0)` (app background) up to `oklch(0.98 0 0)` (primary fill). No brand hue.
- **Layering by lightness.** App bg → sidebar → card → secondary → border → muted-foreground → foreground. Each step is a small lightness bump (~3–5 percentage points), so the eye reads depth from a near-black gradient, not from shadow.
- **Color is reserved for status.** `--destructive` (warm red), `--success` (green ~145°), `--chart-1..5` for visualization. UI chrome never colors itself.
- **Primary inverts.** On dark, "primary" means `oklch(0.98 0 0)` — i.e. the primary button is white-ish, text is near-black. This is the only high-contrast surface in the system; use it to anchor the most important CTA per screen.

### Type
- **Geist + Geist Mono.** Sans for everything human, mono for paths, ids, badges, code, and tokens. Weights used: 400 (body), 500 (medium / interactive labels), 600 (headings).
- **Tracking is tight on display.** `tracking-tight` (≈ -0.025em) on h1+, default on body.
- **Sizes:** hero `text-4xl/lg:text-6xl` (36/60px), section `text-2xl` (24), card title `text-base font-medium`, body `text-sm` (14), caption `text-xs` (12). Stat numbers are `text-2xl` semibold.
- **`text-balance` on every long heading.** Both the landing hero and the CTA section explicitly balance.

### Spacing
- Tailwind 4px base. Common rhythms: `gap-2` (chip groups), `gap-3` (button + icon, header items), `gap-4` (card grids on tight columns), `gap-6` (section content), `space-y-8` (page sections).
- Page padding `p-4 lg:p-6`. Sidebar fixed `w-64`. Top bar fixed `h-14`.
- Cards have `p-5` interior; settings/dialog cards use `pt-6` + `px-6`.

### Backgrounds
- **Flat fills only.** No gradients anywhere in the product UI. (The marketing landing has a single `bg-card/50` band behind features — that's the closest thing to "decorative".)
- **No imagery, no patterns, no textures, no illustrations.** The product ships pure tokens + text + icons.
- **Backdrop blur** is used in two places: sticky landing header (`bg-background/80 backdrop-blur-sm`) and dropdown/popover layers (Radix default).

### Borders
- **Borders carry hierarchy, not shadow.** Every card, divider, and input uses `border-border` (or `border-border/70` for soft dividers) at 1px.
- Active nav item swaps to `bg-sidebar-accent` rather than gaining a stroke. Focus ring is a 3px translucent ring, not a solid border swap.

### Shadows
- **Almost none.** Cards use `shadow-sm` (very subtle), buttons use `shadow-xs`. There is no "elevated" or "floating" shadow tier — depth comes from background-lightness layering.
- Popovers / dropdowns use Radix defaults (`shadow-md`-ish).

### Radii
- Base `--radius: 0.625rem` (10px). Cards use `rounded-xl` (14px), buttons + inputs `rounded-md` (8px), small chips `rounded-md`, status dots / avatars `rounded-full`. Icon tiles inside stat cards: `rounded-lg` (10px).

### Animation
- **Restrained.** The only motion is `transition-colors` on hovers / nav state and a subtle `tw-animate-css` for Radix open/close. No bounce, no springs, no parallax, no entrance animations on page load.
- Easing: Tailwind default (`cubic-bezier(0.4, 0, 0.2, 1)`), durations 150–200ms.

### States
- **Hover:** background bump (e.g. `hover:bg-accent`, `hover:bg-secondary/80`, `hover:bg-primary/90`). Outlined buttons gain `hover:bg-accent`. Links use `hover:underline` with `underline-offset-4`.
- **Active / pressed:** no scale change. The only "press" feedback is the hover state.
- **Focus:** `focus-visible:ring-ring/50 focus-visible:ring-[3px]` and a `focus-visible:border-ring` swap. Always a 3px translucent ring on the existing border.
- **Disabled:** `disabled:opacity-50 disabled:pointer-events-none`.

### Cards & elevation
- Card = `bg-card` + `rounded-xl` + 1px border + `shadow-sm` + `py-6` + `px-6`. Header is a 2-row grid with optional action slot in the top-right. No accent-color left border, no colored fills, no tilt.

### Layout
- **Fixed left sidebar (256px) + sticky top bar (56px)** is the canonical app shell. Content scrolls; sidebar and header don't.
- Max content width is `max-w-6xl` on the marketing page; the app uses fluid full-width with internal grids.
- The Map view is a hard `h-[760px]` 3-column with a 320px left sidebar. Don't make the columns reflow.

### Transparency / blur
- Backdrop blur on the marketing header and the Radix popover layers. Tokenized with `/##` opacity multipliers (`bg-background/80`, `border-border/70`, `bg-success/20`). Never bare `rgba()`.

### Imagery
- **There is none.** No photography, no illustrations, no hero art. Avatars use initials on a neutral chip when no image is set. If a future surface needs imagery, it should be muted, near-monochrome, and never push hue into the chrome.

## ICONOGRAPHY

- **Lucide Icons.** Every icon in the product is from [lucide-react](https://lucide.dev), the standard shadcn/ui icon set. Stroke-style, `1.5–2px` stroke, 24px artboard rendered at 16–20px (Tailwind `size-4` / `size-5`).
- **Sizing rules.** Inline-with-text: `size-4` (16px). In a button: `size-4`, paired with `gap-2`. In a stat tile: `size-5` (20px) inside a `size-10 rounded-lg bg-secondary` chip. Notification dot is `size-2` absolute on top-right of bell button.
- **Color.** Icons inherit `currentColor`. Decorative icons in tiles get `text-muted-foreground`. State icons take their state color (`text-success`, `text-destructive`).
- **Used set** (from real source): `LayoutDashboard, FolderKanban, Code, Code2, Users, Settings, HelpCircle, Search, Bell, ArrowRight, Book, Plus, Upload, Zap, GitBranch, BarChart3, Compass, Check, Activity, KeyRound, Shield, UserRound`. Pull more from Lucide as needed — never substitute a different style.
- **Loading via CDN.** This design system loads Lucide from `https://unpkg.com/lucide@latest` and renders icons via `data-lucide` attributes. The real app imports `lucide-react` per-component.
- **No emoji. No unicode glyphs as icons.** A single arrow caret on a "Show revoked keys" disclosure (`▾` / `▸`) is the lone exception in the source — keep that pattern only for inline disclosures.
- **The CodeMap mark.** A small SVG drawn in `currentColor` — axes (`M3 3v18h18`), a polyline path (`M7 12l4-4 4 4 5-5`), and a filled destination dot (`circle cx=20 cy=7 r=2`). Held in a `size-8 rounded-lg bg-foreground` chip with the glyph in `bg-background` color, so the lockup inverts in dark mode automatically. Source: `_source/components/logo.tsx` and re-exported in `assets/logo.svg`.

## INDEX

- `colors_and_type.css` — copy this into any new artifact for instant brand parity
- `preview/` — registered Design System tab cards (colors, type, spacing, components, brand)
- `ui_kits/web/index.html` — interactive recreation of the CodeMap web app
- `ui_kits/web/*.jsx` — modular React components (Sidebar, Header, StatsGrid, Card, Button, Badge, etc.)
- `assets/logo.svg` — vector mark
- `_source/` — reference implementation (read-only mirror)
- `SKILL.md` — agent skill definition
