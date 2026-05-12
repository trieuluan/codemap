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
  fillConstraint,
  percentageConstraint,
  createLayout,
  splitLayout,
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

// ─── Widget renderer ──────────────────────────────────

export function renderHeader(frame: Frame, state: UIState, area: Rect): void {
  const { config } = state;
  const modeInfo = getModeDisplay(config.mode);

  // Border
  const block = blockBordered({
    borderStyle: styleFg(createStyle(), Color.Cyan),
  });
  frameRenderWidget(frame, renderBlock(block), area);
  const inner = blockInner(block, area);
  if (inner.width === 0 || inner.height === 0) return;

  // Layout: 60% centered content
  const layout = createLayout(
    [fillConstraint(1), percentageConstraint(60), fillConstraint(1)],
    { direction: "horizontal" },
  );
  const cols = splitLayout(layout, inner);
  const centerArea = cols[1]!;
  if (centerArea.width === 0) return;

  let y = centerArea.y;

  // Banner lines — gradient cyan → magenta
  for (const line of BANNER_LINES) {
    if (y >= centerArea.y + centerArea.height) break;
    const spans = gradientSpans(
      line,
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 0, b: 255 },
      true,
    );
    const lineWidth = spans.reduce((w, s) => w + s.content.length, 0);
    const pad = Math.max(0, Math.floor((centerArea.width - lineWidth) / 2));
    const paddedSpans = [createSpan(" ".repeat(pad), createStyle()), ...spans];
    const para = createParagraph("", { alignment: "left" });
    // Inject spans as a single line
    (para.text as { lines: typeof para.text.lines }).lines = [
      { spans: paddedSpans, style: createStyle() },
    ];
    frameRenderWidget(frame, renderParagraph(para), {
      x: centerArea.x,
      y,
      width: centerArea.width,
      height: 1,
    });
    y++;
  }
  // Subtitle with gradient
  if (y < centerArea.y + centerArea.height) {
    const subtitle = "AI - POWERED CODE INTELLIGENCE & AGENT PLATFORM";
    const spans = gradientSpans(
      subtitle,
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 0, b: 255 },
      true,
    );
    const para = createParagraph("", { alignment: "center" });
    (para.text as { lines: typeof para.text.lines }).lines = [
      { spans: spans, style: createStyle() },
    ];
    frameRenderWidget(frame, renderParagraph(para), {
      x: centerArea.x,
      y,
      width: centerArea.width,
      height: 1,
    });
    y++;
  }

  // Info line
  if (y < centerArea.y + centerArea.height) {
    const infoParts: { text: string; color: Color }[] = [
      { text: "model ", color: Color.DarkGray },
      { text: config.model, color: Color.White },
      { text: "  │  ", color: Color.DarkGray },
      { text: "mode ", color: Color.DarkGray },
      { text: modeInfo.label, color: Color.Green },
      { text: "  │  ", color: Color.DarkGray },
      { text: "profile ", color: Color.DarkGray },
      { text: config.profile, color: Color.White },
      { text: "  │  ", color: Color.DarkGray },
      { text: "branch ", color: Color.DarkGray },
      { text: "master", color: Color.Magenta },
    ];
    const totalLen = infoParts.reduce((w, p) => w + p.text.length, 0);
    const pad = Math.max(0, Math.floor((centerArea.width - totalLen) / 2));
    const spans = [
      createSpan(" ".repeat(pad), createStyle()),
      ...infoParts.map((p) =>
        createSpan(p.text, styleFg(createStyle(), p.color)),
      ),
    ];
    const para = createParagraph("", { alignment: "left" });
    (para.text as { lines: typeof para.text.lines }).lines = [
      { spans, style: createStyle() },
    ];
    y++;
    frameRenderWidget(frame, renderParagraph(para), {
      x: centerArea.x,
      y,
      width: centerArea.width,
      height: 1,
    });
    y++;
  }
}
