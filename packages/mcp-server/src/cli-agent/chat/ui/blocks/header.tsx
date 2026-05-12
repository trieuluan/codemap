import {
  createParagraph,
  createSpan,
  createStyle,
  blockBordered,
  blockInner,
  styleFg,
  styleAddModifier,
  Modifier,
  Color,
  frameRenderWidget,
  renderBlock,
  renderParagraph,
} from "terminui";
import type { Frame, Rect, Style } from "terminui";
import type { UIState } from "../store.js";
import { getModeDisplay } from "../../commands/route-policy.js";
import cfonts from "cfonts";

// ─── Banner ───────────────────────────────────────────

function generateBanner(): string[] {
  const result = cfonts.render("CODEMAP", {
    font: "simple3d",
    gradient: ["cyan", "magenta"],
    env: "node",
  });
  const raw: string = (result as { string: string } | false)
    ? (result as { string: string }).string
    : "";
  const lines = raw.split("\n").map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
  let start = 0;
  while (start < lines.length && lines[start]!.trim() === "") start++;
  let end = lines.length - 1;
  while (end >= 0 && lines[end]!.trim() === "") end--;
  return lines.slice(start, end + 1);
}

const BANNER_LINES = generateBanner();

// ─── Gradient helper ──────────────────────────────────

function gradientSpans(
  text: string,
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  bold = true,
) {
  const chars = [...text];
  return chars.map((char, i) => {
    const t = chars.length <= 1 ? 0 : i / (chars.length - 1);
    const r = Math.round(from.r + (to.r - from.r) * t);
    const g = Math.round(from.g + (to.g - from.g) * t);
    const b = Math.round(from.b + (to.b - from.b) * t);
    let style: Style = createStyle({ fg: { type: "rgb", r, g, b } });
    if (bold) {
      style = styleAddModifier(style, Modifier.BOLD);
    }
    return createSpan(char, style);
  });
}

// ─── Render a row of spans centered in area ──────────

type RawSpan = ReturnType<typeof createSpan>;

function renderSpanRow(
  frame: Frame,
  spans: RawSpan[],
  x: number,
  y: number,
  width: number,
): void {
  const totalText = spans.reduce((w, s) => w + s.content.length, 0);
  const pad = Math.max(0, Math.floor((width - totalText) / 2));
  const all: RawSpan[] = [
    ...(pad > 0 ? [createSpan(" ".repeat(pad), createStyle())] : []),
    ...spans,
  ];
  const para = createParagraph("", { alignment: "left" });
  (para.text as { lines: typeof para.text.lines }).lines = [
    { spans: all, style: createStyle() },
  ];
  frameRenderWidget(frame, renderParagraph(para), { x, y, width, height: 1 });
}

// ─── Widget renderer ──────────────────────────────────

export function renderHeader(frame: Frame, state: UIState, area: Rect): void {
  const { config } = state;
  const modeInfo = getModeDisplay(config.mode);

  // Cyan-bordered panel
  const block = blockBordered({
    borderStyle: styleFg(createStyle(), Color.Cyan),
  });
  frameRenderWidget(frame, renderBlock(block), area);
  const inner = blockInner(block, area);
  if (inner.width === 0 || inner.height === 0) return;

  let y = inner.y;

  // ─── Banner: gradient cyan → purple ──────────────
  for (const line of BANNER_LINES) {
    if (y >= inner.y + inner.height) break;
    const spans = gradientSpans(
      line,
      { r: 0, g: 229, b: 255 },
      { r: 168, g: 85, b: 247 },
      true,
    );
    renderSpanRow(frame, spans, inner.x, y, inner.width);
    y++;
  }

  // ─── Subtitle: cyan → purple gradient, no bold ───
  if (y < inner.y + inner.height) {
    const subtitle = "AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM";
    const spans = gradientSpans(
      subtitle,
      { r: 34, g: 211, b: 238 },
      { r: 168, g: 85, b: 247 },
      false,
    );
    renderSpanRow(frame, spans, inner.x, y, inner.width);
    y++;
  }

  // ─── Blank separator ─────────────────────────────
  y++;

  // ─── Info pills row ───────────────────────────────
  if (y < inner.y + inner.height) {
    const cyanBold = styleAddModifier(
      createStyle({ fg: { type: "rgb", r: 0, g: 229, b: 255 } }),
      Modifier.BOLD,
    );
    const white = createStyle({ fg: { type: "rgb", r: 229, g: 231, b: 235 } });
    const gray = createStyle({ fg: { type: "rgb", r: 107, g: 114, b: 128 } });
    const green = createStyle({ fg: { type: "rgb", r: 16, g: 185, b: 129 } });
    const sep = "  │  ";

    const spans: RawSpan[] = [
      createSpan("⊙ ", cyanBold),
      createSpan(config.profile, white),
      createSpan(sep, gray),
      createSpan("◆ ", cyanBold),
      createSpan(config.model, white),
      createSpan(sep, gray),
      createSpan("◈ ", cyanBold),
      createSpan(modeInfo.label, green),
      createSpan(sep, gray),
      createSpan("⊛ MCP ", gray),
      createSpan("● Connected", cyanBold),
    ];
    renderSpanRow(frame, spans, inner.x, y, inner.width);
    y++;
  }

  // ─── Quick Start hints ────────────────────────────
  if (y < inner.y + inner.height) {
    const cyanBold = styleAddModifier(
      styleFg(createStyle(), Color.Cyan),
      Modifier.BOLD,
    );
    const dim = styleAddModifier(styleFg(createStyle(), Color.DarkGray), Modifier.DIM);

    const spans: RawSpan[] = [
      createSpan("▸ Quick Start: ", cyanBold),
      createSpan("/help for all commands", dim),
      createSpan("  ·  ", dim),
      createSpan("@ to reference files", dim),
      createSpan("  ·  ", dim),
      createSpan("Tab for suggestions", dim),
      createSpan("  ·  ", dim),
      createSpan("Ctrl+C to cancel", dim),
    ];
    renderSpanRow(frame, spans, inner.x, y, inner.width);
    y++;
  }
}
