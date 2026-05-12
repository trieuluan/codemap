import {
  createParagraph,
  createStyle,
  styleFg,
  styleAddModifier,
  Modifier,
  Color,
  frameRenderWidget,
  renderParagraph,
} from "terminui";
import type { Frame, Rect, Style } from "terminui";

interface HelpLine {
  text: string;
  color: Style["fg"];
  bold: boolean;
}

const HELP_LINES: HelpLine[] = [
  { text: "", color: Color.Reset, bold: false },
  { text: "  CODEMAP — Commands", color: Color.Cyan, bold: true },
  { text: "", color: Color.Reset, bold: false },
  { text: "  Chat", color: Color.White, bold: false },
  { text: "    Type naturally to chat with the AI agent", color: Color.DarkGray, bold: false },
  { text: "", color: Color.Reset, bold: false },
  { text: "  Model", color: Color.White, bold: false },
  { text: "    /model              Switch AI model", color: Color.Green, bold: false },
  { text: "    /model <name>       Switch to specific model", color: Color.Green, bold: false },
  { text: "", color: Color.Reset, bold: false },
  { text: "  Mode", color: Color.White, bold: false },
  { text: "    /mode               Change gateway mode", color: Color.Yellow, bold: false },
  { text: "    local-only          No cloud calls", color: Color.DarkGray, bold: false },
  { text: "    ask-before-cloud    Confirm before cloud", color: Color.DarkGray, bold: false },
  { text: "    cloud-ok            Allow cloud calls", color: Color.DarkGray, bold: false },
  { text: "    hybrid              Best of both", color: Color.DarkGray, bold: false },
  { text: "", color: Color.Reset, bold: false },
  { text: "  Tools", color: Color.White, bold: false },
  { text: "    /retry              Resend last message", color: Color.Cyan, bold: false },
  { text: "    /clear              Clear message history", color: Color.Cyan, bold: false },
  { text: "", color: Color.Reset, bold: false },
  { text: "  Other", color: Color.White, bold: false },
  { text: "    /debug              Toggle debug logging", color: Color.Magenta, bold: false },
  { text: "    /exit               Quit CodeMap", color: Color.Magenta, bold: false },
  { text: "", color: Color.Reset, bold: false },
  { text: "  Press any key to return...", color: Color.DarkGray, bold: false },
];

export function renderHelpScreen(frame: Frame, area: Rect): void {
  let y = area.y;
  for (const line of HELP_LINES) {
    if (y >= area.y + area.height) break;
    let style = createStyle();
    if (line.color !== Color.Reset) {
      style = styleFg(style, line.color!);
    }
    if (line.bold) {
      style = styleAddModifier(style, Modifier.BOLD);
    }
    const para = createParagraph(line.text, { style });
    frameRenderWidget(frame, renderParagraph(para), { x: area.x, y, width: area.width, height: 1 });
    y++;
  }
}
