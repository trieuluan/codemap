# Fonts

CodeMap uses **Geist** (sans) and **Geist Mono** (mono), Vercel's open-source family.

The real app loads them via `next/font/google`:

```ts
import { Geist, Geist_Mono } from "next/font/google";
const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
```

This design system loads them from Google Fonts at the top of `colors_and_type.css`:

```
@import url("https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap");
```

No local `.ttf` / `.woff2` files are bundled — the source repo doesn't ship them either. If you need offline-capable artifacts, download the families from [Google Fonts](https://fonts.google.com/specimen/Geist) or [vercel/geist-font](https://github.com/vercel/geist-font) and drop them here as `Geist-Variable.woff2` / `GeistMono-Variable.woff2`, then add a local `@font-face` block to `colors_and_type.css`.

## Substitution policy

If Geist fails to load, the stack falls back to:

```
"Geist Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
```

This is what `next/font` provides automatically. Visual parity is close on macOS / iOS (system-ui ≈ SF Pro), acceptable on Windows (Segoe UI), and the size scale + weights are picked to look right with either family.

> **Flagged substitution:** none right now. We are loading the real Geist + Geist Mono from Google Fonts. If the user wants the variable `.woff2` files in-repo for offline use, they'll need to drop them in this folder.
