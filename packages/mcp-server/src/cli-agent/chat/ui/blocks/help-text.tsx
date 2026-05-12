import {
  createParagraph,
  createStyle,
  styleFg,
  styleAddModifier,
  Modifier,
  Color,
  frameRenderWidget,
  renderParagraph,
  styledSpan,
  createLine,
} from "terminui";
import type { Frame, Rect } from "terminui";

const SHORTCUTS: Array<[string, string]> = [
  ["[Tab]", "Complete"],
  ["[↑↓]", "History"],
  ["[@]", "Files"],
  ["[Ctrl+C]", "Cancel"],
  ["[Esc]", "Menu"],
  ["[/]", "Commands"],
  ["[?]", "Help"],
];

export function renderHelpHints(frame: Frame, area: Rect): void {
  const keyStyle = styleFg(createStyle(), Color.Cyan);
  const descStyle = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);

  const spans = [styledSpan("  ", descStyle)];
  for (let i = 0; i < SHORTCUTS.length; i++) {
    const [key, desc] = SHORTCUTS[i]!;
    spans.push(styledSpan(key, keyStyle));
    spans.push(styledSpan(` ${desc}`, descStyle));
    if (i < SHORTCUTS.length - 1) {
      spans.push(styledSpan("  ", descStyle));
    }
  }

  const line = createLine(spans);
  const para = createParagraph("", {});
  const styledPara = {
    ...para,
    text: { lines: [line], style: descStyle, alignment: "left" as const },
  };
  frameRenderWidget(frame, renderParagraph(styledPara), { ...area, height: 1 });
}
