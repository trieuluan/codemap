---
name: codemap-design
description: Use this skill to generate well-branded interfaces and assets for CodeMap, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

# CodeMap Design Skill

CodeMap is a dark-themed code-mapping web app. The shell is fixed left sidebar (256px, `var(--sidebar)`) + sticky top bar (56px, `var(--background)` + bottom border) + content area on `var(--background)`. Cards are `bg-card` with thin `var(--border)` and `--shadow-sm` (almost zero). Type does the hierarchy — the palette is neutrals only, no brand color.

## How to use

1. **Read `README.md`** — single source of truth for product context, content tone, visual foundations, and iconography rules. Read it before designing anything.
2. **Pull tokens from `colors_and_type.css`** — every color, font stack, radius, and shadow lives there as a CSS variable. Never invent new ones; if you need a new color, derive it via `color-mix(in oklch, …)`.
3. **Reuse the UI kit** — `ui_kits/web/` is a working React recreation of the app. Open `index.html` to see live versions of the sidebar, header, dashboard, projects list, project detail, code map (3-column explorer + insights + graph), and settings (Account / API Keys / Team / Billing + danger zone). Copy components from `*.jsx` rather than rebuilding.
4. **Iconography is Lucide.** Stroke `2`, size `14–16` next to text, `18–20` standalone. Never substitute emoji.
5. **Type pairing is fixed.** Geist for human copy, Geist Mono for paths, ids, key previews, durations, and any code-shaped value.

## Working modes

- **Throwaway prototype / mock / slide:** copy the relevant assets out of this skill folder into a new HTML file. Link `colors_and_type.css`, load Geist from Google Fonts (already pinned in `fonts/`), and lift JSX components verbatim from `ui_kits/web/`. Match the visual foundations in README.md exactly — that is the bar.
- **Production code (Next.js + Tailwind + shadcn):** the tokens in `colors_and_type.css` mirror the real `_source/app/globals.css`. Use the existing `_source/components/ui/*` shadcn primitives and the feature components in `_source/features/`. The UI kit's JSX is a cosmetic recreation, not a drop-in — for prod work, read the real source.

## When invoked without guidance

Ask the user what they want to build. Useful clarifying questions:

- Which surface — auth (centered card) or app shell (sidebar + top bar)?
- Which screen does it sit next to in the existing app? (Dashboard, Projects, Project Detail, Code Map, Settings)
- Is this a throwaway HTML mock, a slide, or production Next.js?
- Any new copy needed? Match the README's tone — direct, lowercase-friendly action verbs, plain explanatory subtitles, mono for technical tokens.

Then act as an expert designer: lift tokens and components from this skill, produce a faithful artifact, and flag anywhere you deviated from the system.

## Strict rules

- Dark theme only. Light tokens exist in `colors_and_type.css` but the product ships dark.
- Neutrals only. No brand accent color. Status uses semantic green/amber/red with low chroma — see `preview/colors-status.html`.
- No emoji. No hand-drawn SVG illustrations. No bluish-purple gradients. No colored-left-border cards.
- Do not invent new screens for the UI kit. Copy what's in the codebase.
- Mono font for any value the user could paste into a terminal.
