import { BOLD, DIM, RESET, fg } from "../ink-utils.js";

function bg(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

export const C_CYAN = `${BOLD}${fg(88, 213, 247)}`;
export const C_BLUE = fg(122, 184, 255);
export const C_PINK = fg(244, 114, 182);
export const C_GRAY = fg(156, 163, 175);
export const C_MUTED = fg(107, 114, 128);
export const C_WHITE = fg(229, 231, 235);
export const C_GREEN = fg(16, 185, 129);
export const C_YELLOW = fg(245, 158, 11);
export const C_RED = fg(239, 68, 68);
export const C_PURPLE = fg(155, 140, 255);

export const C_ACTION = C_CYAN;
export const C_AI = `${BOLD}${C_PURPLE}`;
export const C_ARCH = C_PINK;
export const C_INFO = fg(34, 211, 238);
export const C_SUCCESS = C_GREEN;
export const C_WARNING = C_YELLOW;
export const C_ERROR = C_RED;
export const C_DIM = DIM;

export const BG_SURFACE = bg(17, 24, 39);
export const BG_SURFACE_SOFT = bg(22, 27, 46);
export const BG_USER = bg(55, 65, 81);

export const SPINNER = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

export const ENABLE_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1006h";
export const DISABLE_MOUSE_TRACKING = "\x1b[?1000l\x1b[?1006l";

export { BOLD, DIM, RESET };
