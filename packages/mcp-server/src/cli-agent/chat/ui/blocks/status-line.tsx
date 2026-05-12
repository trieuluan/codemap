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
import type { UIState } from "../store.js";
import { getModeDisplay } from "../../commands/route-policy.js";

export function renderStatusLine(frame: Frame, state: UIState, area: Rect): void {
  const { config } = state;
  const modeInfo = getModeDisplay(config.mode);

  const dim = styleFg(styleAddModifier(createStyle(), Modifier.DIM), Color.DarkGray);
  const white = styleFg(createStyle(), Color.White);
  const green = styleFg(createStyle(), Color.Green);
  const cyan = styleFg(createStyle(), Color.Cyan);
  const sep = "  ·  ";

  const spans = [
    styledSpan("  workspace: ", dim),
    styledSpan(config.profile, white),
    styledSpan(sep, dim),
    styledSpan("model: ", dim),
    styledSpan(config.model, white),
    styledSpan(sep, dim),
    styledSpan("mode: ", dim),
    styledSpan(modeInfo.label, green),
    styledSpan(sep, dim),
    styledSpan("MCP: ", dim),
    styledSpan("● Connected", cyan),
  ];

  const line = createLine(spans);
  const para = createParagraph("", {});
  const styledPara = {
    ...para,
    text: { lines: [line], style: dim, alignment: "left" as const },
  };
  frameRenderWidget(frame, renderParagraph(styledPara), { ...area, height: 1 });
}
