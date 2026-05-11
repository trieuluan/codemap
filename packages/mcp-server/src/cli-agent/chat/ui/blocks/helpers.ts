import type { GatewayMode } from "../../../types.js";
import { Color, Modifier, createStyle, styleFg, styleAddModifier } from "terminui";
import type { Style } from "terminui";

// ─── Formatters ─────────────────────────────────────────

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(0);
  return `${m}m${sec}s`;
}

export function formatTokenCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── Style Helpers ──────────────────────────────────────

export function colorByMode(mode: GatewayMode | string): Style {
  switch (mode) {
    case "local-only":
      return styleFg(createStyle(), Color.Red);
    case "ask-before-cloud":
      return styleFg(createStyle(), Color.Yellow);
    case "cloud-ok":
      return styleFg(createStyle(), Color.Green);
    case "hybrid":
      return styleFg(createStyle(), Color.Cyan);
    default:
      return styleFg(createStyle(), Color.Cyan);
  }
}

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const dimStyle = styleFg(createStyle(), Color.Gray);
export const boldCyanStyle = styleAddModifier(styleFg(createStyle(), Color.Cyan), Modifier.BOLD);
export const boldGreenStyle = styleAddModifier(styleFg(createStyle(), Color.Green), Modifier.BOLD);
export const boldRedStyle = styleAddModifier(styleFg(createStyle(), Color.Red), Modifier.BOLD);
export const boldWhiteStyle = styleAddModifier(styleFg(createStyle(), Color.White), Modifier.BOLD);
export const boldYellowStyle = styleAddModifier(styleFg(createStyle(), Color.Yellow), Modifier.BOLD);
export const cyanStyle = styleFg(createStyle(), Color.Cyan);
export const greenStyle = styleFg(createStyle(), Color.Green);
export const yellowStyle = styleFg(createStyle(), Color.Yellow);
export const redStyle = styleFg(createStyle(), Color.Red);
export const whiteStyle = styleFg(createStyle(), Color.White);
export const magentaStyle = styleFg(createStyle(), Color.Magenta);
