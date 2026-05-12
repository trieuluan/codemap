import {
  createParagraph,
  createBlock,
  Borders,
  createTitle,
  createStyle,
  styleFg,
  styleAddModifier,
  Modifier,
  Color,
  frameRenderWidget,
  renderParagraph,
  renderBlock,
  styledSpan,
  createLine,
} from "terminui";
import type { Frame, Rect } from "terminui";
import type { UIState } from "../store.js";

/**
 * Widget-based input composer.
 * Renders a bordered input box with the current text and cursor.
 * Uses frameRenderWidget for direct buffer writes.
 */
export function renderInputComposer(
  frame: Frame,
  state: UIState,
  area: Rect,
): void {
  const w = area.width;
  const text = state.inputText;
  const cursor = state.inputCursor;

  // Top border with title
  const topBlock = createBlock({
    borders: Borders.TOP | Borders.LEFT | Borders.RIGHT,
    titles: [createTitle(" Input ")],
  });
  frameRenderWidget(frame, renderBlock(topBlock), { ...area, height: 1 });

  // Input line — show placeholder when empty
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const showPlaceholder = text.length === 0;
  const displayText = showPlaceholder
    ? "Ask anything or type / for commands..."
    : `${before}█${after}`;

  const prefixStyle = styleAddModifier(styleFg(createStyle(), Color.Cyan), Modifier.BOLD);
  const textStyle = styleFg(createStyle(), Color.White);
  const placeholderStyle = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);

  const inputLine = createLine([
    styledSpan(" > ", prefixStyle),
    styledSpan(displayText.slice(0, w - 6), showPlaceholder ? placeholderStyle : textStyle),
  ]);
  const inputPara = createParagraph("", { style: textStyle });
  const styledPara = {
    ...inputPara,
    text: { lines: [inputLine], style: textStyle, alignment: "left" as const },
  };
  frameRenderWidget(frame, renderParagraph(styledPara), {
    ...area,
    y: area.y + 1,
    height: 1,
  });

  // Bottom border
  const bottomBlock = createBlock({
    borders: Borders.BOTTOM | Borders.LEFT | Borders.RIGHT,
  });
  frameRenderWidget(frame, renderBlock(bottomBlock), {
    ...area,
    y: area.y + 2,
    height: 1,
  });
}
