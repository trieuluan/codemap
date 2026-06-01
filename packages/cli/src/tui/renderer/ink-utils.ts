// ─── ANSI helpers (no chalk dep) ─────────────────────────

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";

export function fg(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function gradientStr(
  text: string,
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  bold = true,
): string {
  const chars = [...text];
  return chars
    .map((ch, i) => {
      const t = chars.length <= 1 ? 0 : i / (chars.length - 1);
      const r = Math.round(from.r + (to.r - from.r) * t);
      const g = Math.round(from.g + (to.g - from.g) * t);
      const b = Math.round(from.b + (to.b - from.b) * t);
      return `${bold ? BOLD : ""}${fg(r, g, b)}${ch}${RESET}`;
    })
    .join("");
}

// ─── Text helpers ─────────────────────────────────────────

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function formatTime(ts?: number): string {
  const d = new Date(ts ?? Date.now());
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
