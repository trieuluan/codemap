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

// ─── Gradient spans ───────────────────────────────────

type RawSpan = ReturnType<typeof createSpan>;

function gradientSpans(
  text: string,
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  bold = true,
): RawSpan[] {
  const chars = [...text];
  return chars.map((char, i) => {
    const t = chars.length <= 1 ? 0 : i / (chars.length - 1);
    const r = Math.round(from.r + (to.r - from.r) * t);
    const g = Math.round(from.g + (to.g - from.g) * t);
    const b = Math.round(from.b + (to.b - from.b) * t);
    let style: Style = createStyle({ fg: { type: "rgb", r, g, b } });
    if (bold) style = styleAddModifier(style, Modifier.BOLD);
    return createSpan(char, style);
  });
}

// ─── Render spans centered in a row ──────────────────

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

// ─── Render paragraph from raw spans ─────────────────

function renderSpans(frame: Frame, spans: RawSpan[], area: Rect): void {
  const para = createParagraph("", { alignment: "left" });
  (para.text as { lines: typeof para.text.lines }).lines = [
    { spans, style: createStyle() },
  ];
  frameRenderWidget(frame, renderParagraph(para), { ...area, height: 1 });
}

// ─── Widget renderer ──────────────────────────────────

export function renderHeader(frame: Frame, state: UIState, area: Rect): void {
  const { config } = state;
  const modeInfo = getModeDisplay(config.mode);

  // ── Outer rounded panel (cyan border) ───────────────
  const outerBlock = blockBordered({
    borderType: "rounded",
    borderStyle: createStyle({ fg: { type: "rgb", r: 0, g: 229, b: 255 } }),
  });
  frameRenderWidget(frame, renderBlock(outerBlock), area);
  const inner = blockInner(outerBlock, area);
  if (inner.width === 0 || inner.height === 0) return;

  let y = inner.y;
  const padX = 2;
  const subW = Math.max(10, inner.width - padX * 2);
  const subX = inner.x + padX;

  // ── Banner: gradient cyan → purple ──────────────────
  for (const line of BANNER_LINES) {
    if (y >= inner.y + inner.height) break;
    renderSpanRow(
      frame,
      gradientSpans(
        line,
        { r: 0, g: 229, b: 255 },
        { r: 168, g: 85, b: 247 },
        true,
      ),
      inner.x,
      y,
      inner.width,
    );
    y++;
  }

  // ── Subtitle ─────────────────────────────────────────
  if (y < inner.y + inner.height) {
    renderSpanRow(
      frame,
      gradientSpans(
        "AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM",
        { r: 34, g: 211, b: 238 },
        { r: 168, g: 85, b: 247 },
        false,
      ),
      inner.x,
      y,
      inner.width,
    );
    y++;
  }

  y++; // blank separator

  // ── Pills box: rounded dark-gray border, 4 lines ────
  if (y + 4 <= inner.y + inner.height) {
    const pillsArea: Rect = { x: subX, y, width: subW, height: 4 };
    const pillsBlock = blockBordered({
      borderType: "rounded",
      borderStyle: createStyle({ fg: { type: "rgb", r: 55, g: 65, b: 81 } }),
    });
    frameRenderWidget(frame, renderBlock(pillsBlock), pillsArea);
    const pi = blockInner(pillsBlock, pillsArea);

    const workspaceName = state.workspace?.repoName ?? config.profile;
    const pills: Array<{
      icon: string;
      label: string;
      value: string;
      color: "cyan" | "green" | "white";
    }> = [
      { icon: "⊙", label: "Version", value: "v0.1.0", color: "white" },
      { icon: "⊞", label: "Workspace", value: workspaceName, color: "white" },
      { icon: "◆", label: "Model", value: config.model, color: "white" },
      { icon: "◈", label: "Mode", value: modeInfo.label, color: "green" },
      { icon: "⊛", label: "MCP", value: "●Connected", color: "green" },
    ];

    const nSep = pills.length - 1;
    const colW = Math.max(4, Math.floor((pi.width - nSep * 3) / pills.length));

    const sepSt = createStyle({ fg: { type: "rgb", r: 55, g: 65, b: 81 } });
    const iconSt = styleAddModifier(
      createStyle({ fg: { type: "rgb", r: 0, g: 229, b: 255 } }),
      Modifier.DIM,
    );
    const dimSt = styleAddModifier(
      createStyle({ fg: { type: "rgb", r: 107, g: 114, b: 128 } }),
      Modifier.DIM,
    );

    const row0: RawSpan[] = [];
    const row1: RawSpan[] = [];

    for (let i = 0; i < pills.length; i++) {
      const pill = pills[i]!;
      if (i > 0) {
        row0.push(createSpan(" │ ", sepSt));
        row1.push(createSpan(" │ ", sepSt));
      }

      // Row 0: icon + label name, padded
      const r0 = `${pill.icon} ${pill.label}`;
      row0.push(createSpan(r0, iconSt));
      row0.push(createSpan(" ".repeat(Math.max(0, colW - r0.length)), dimSt));

      // Row 1: bold value, padded
      const valSt: Style =
        pill.color === "cyan"
          ? styleAddModifier(
              createStyle({ fg: { type: "rgb", r: 0, g: 229, b: 255 } }),
              Modifier.BOLD,
            )
          : pill.color === "green"
            ? styleAddModifier(
                styleFg(createStyle(), Color.Green),
                Modifier.BOLD,
              )
            : styleAddModifier(
                styleFg(createStyle(), Color.White),
                Modifier.BOLD,
              );

      const r1 = pill.value.slice(0, colW);
      row1.push(createSpan(r1, valSt));
      row1.push(createSpan(" ".repeat(Math.max(0, colW - r1.length)), dimSt));
    }

    renderSpans(frame, row0, { ...pi, y: pi.y, height: 1 });
    renderSpans(frame, row1, { ...pi, y: pi.y + 1, height: 1 });
    y += 4;
  }

  // ── Quick Start box: rounded purple border, 3 lines ─
  if (y + 3 <= inner.y + inner.height) {
    const qsArea: Rect = { x: subX, y, width: subW, height: 3 };
    const qsBlock = blockBordered({
      borderType: "rounded",
      borderStyle: createStyle({ fg: { type: "rgb", r: 168, g: 85, b: 247 } }),
    });
    frameRenderWidget(frame, renderBlock(qsBlock), qsArea);
    const qi = blockInner(qsBlock, qsArea);

    const cyanBold = styleAddModifier(
      styleFg(createStyle(), Color.Cyan),
      Modifier.BOLD,
    );
    const dimGray = styleAddModifier(
      styleFg(createStyle(), Color.DarkGray),
      Modifier.DIM,
    );

    renderSpans(
      frame,
      [
        createSpan(" Quick Start: ", cyanBold),
        createSpan("Type /help to see all commands", dimGray),
        createSpan("  •  ", dimGray),
        createSpan("Use @ to reference files", dimGray),
        createSpan("  •  ", dimGray),
        createSpan("Press Tab for suggestions", dimGray),
        createSpan("  •  ", dimGray),
        createSpan("Ctrl+C to cancel", dimGray),
      ],
      { ...qi, height: 1 },
    );
    y += 3;
  }
}
