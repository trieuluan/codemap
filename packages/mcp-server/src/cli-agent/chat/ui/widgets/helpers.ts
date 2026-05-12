import { createStyle, styleFg, styleAddModifier, Modifier, Color } from "terminui";
import type { Style } from "terminui";

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function fgStyle(color: Style["fg"]): Style {
  return styleFg(createStyle(), color!);
}

export function boldFgStyle(color: Style["fg"]): Style {
  return styleAddModifier(styleFg(createStyle(), color!), Modifier.BOLD);
}

export function dimStyle(): Style {
  return styleAddModifier(styleFg(createStyle(), Color.DarkGray), Modifier.DIM);
}
