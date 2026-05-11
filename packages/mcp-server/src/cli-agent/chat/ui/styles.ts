/**
 * Shared style helpers for terminui JSX components.
 */
import { Color, Modifier, createStyle, styleFg, styleAddModifier } from "terminui";
import type { Style } from "terminui";
import type { GatewayMode } from "../../types.js";

// ─── Color Palette ──────────────────────────────────────

export const C = {
  primary: Color.Cyan,
  secondary: Color.Magenta,
  success: Color.Green,
  warning: Color.Yellow,
  error: Color.Red,
  text: Color.White,
  dim: Color.Gray,
  border: Color.Gray,
  darkBorder: Color.DarkGray,
} as const;

// ─── Pre-built Styles ───────────────────────────────────

export const borderStyle = styleFg(createStyle(), Color.DarkGray);
export const dimStyle = styleFg(createStyle(), Color.Gray);
export const boldStyle = styleAddModifier(createStyle(), Modifier.BOLD);
export const dimBoldStyle = styleAddModifier(styleFg(createStyle(), Color.Gray), Modifier.BOLD);

export function fgStyle(color: Color): Style {
  return styleFg(createStyle(), color);
}

export function boldFgStyle(color: Color): Style {
  return styleAddModifier(styleFg(createStyle(), color), Modifier.BOLD);
}

// ─── Mode Color ─────────────────────────────────────────

export function colorByMode(mode: GatewayMode | string): Color {
  switch (mode) {
    case "local-only": return Color.Red;
    case "ask-before-cloud": return Color.Yellow;
    case "cloud-ok": return Color.Green;
    case "hybrid": return Color.Cyan;
    default: return Color.Cyan;
  }
}

export function styleByMode(mode: GatewayMode | string): Style {
  return styleFg(createStyle(), colorByMode(mode));
}
