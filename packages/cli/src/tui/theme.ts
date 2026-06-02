import { BOLD, DIM, RESET, bg, fg } from "./renderer/ink-utils.js";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface TerminalTextToken {
  color?: RgbColor;
  bold?: boolean;
  dim?: boolean;
}

export interface TerminalColorTheme {
  name: string;
  text: {
    cyan: TerminalTextToken;
    blue: TerminalTextToken;
    pink: TerminalTextToken;
    gray: TerminalTextToken;
    muted: TerminalTextToken;
    white: TerminalTextToken;
    green: TerminalTextToken;
    yellow: TerminalTextToken;
    red: TerminalTextToken;
    purple: TerminalTextToken;
    action: TerminalTextToken;
    ai: TerminalTextToken;
    arch: TerminalTextToken;
    info: TerminalTextToken;
    success: TerminalTextToken;
    warning: TerminalTextToken;
    error: TerminalTextToken;
  };
  background: {
    surface: RgbColor;
    surfaceSoft: RgbColor;
    user: RgbColor;
    diffAdd: RgbColor;
    diffDelete: RgbColor;
  };
  spinner: readonly string[];
}

export type PartialTerminalColorTheme = Partial<Omit<TerminalColorTheme, "text" | "background">> & {
  text?: Partial<TerminalColorTheme["text"]>;
  background?: Partial<TerminalColorTheme["background"]>;
};

const cyan = { r: 88, g: 213, b: 247 };
const blue = { r: 122, g: 184, b: 255 };
const pink = { r: 244, g: 114, b: 182 };
const gray = { r: 156, g: 163, b: 175 };
const muted = { r: 107, g: 114, b: 128 };
const white = { r: 229, g: 231, b: 235 };
const green = { r: 16, g: 185, b: 129 };
const yellow = { r: 245, g: 158, b: 11 };
const red = { r: 239, g: 68, b: 68 };
const purple = { r: 155, g: 140, b: 255 };

export const CODEMAP_DARK_THEME: TerminalColorTheme = {
  name: "codemap-dark",
  text: {
    cyan: { color: cyan, bold: true },
    blue: { color: blue },
    pink: { color: pink },
    gray: { color: gray },
    muted: { color: muted },
    white: { color: white },
    green: { color: green },
    yellow: { color: yellow },
    red: { color: red },
    purple: { color: purple },
    action: { color: cyan, bold: true },
    ai: { color: purple, bold: true },
    arch: { color: pink },
    info: { color: { r: 34, g: 211, b: 238 } },
    success: { color: green },
    warning: { color: yellow },
    error: { color: red },
  },
  background: {
    surface: { r: 17, g: 24, b: 39 },
    surfaceSoft: { r: 22, g: 27, b: 46 },
    user: { r: 55, g: 65, b: 81 },
    diffAdd: { r: 0, g: 55, b: 18 },
    diffDelete: { r: 69, g: 10, b: 10 },
  },
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
};

let activeTheme = CODEMAP_DARK_THEME;

export function getTheme(): TerminalColorTheme {
  return activeTheme;
}

export function setTheme(theme: PartialTerminalColorTheme): TerminalColorTheme {
  activeTheme = mergeTheme(CODEMAP_DARK_THEME, theme);
  refreshThemeExports();
  return activeTheme;
}

export function resetTheme(): TerminalColorTheme {
  activeTheme = CODEMAP_DARK_THEME;
  refreshThemeExports();
  return activeTheme;
}

export function mergeTheme(base: TerminalColorTheme, override: PartialTerminalColorTheme): TerminalColorTheme {
  return {
    name: override.name ?? base.name,
    text: {
      cyan: override.text?.cyan ?? base.text.cyan,
      blue: override.text?.blue ?? base.text.blue,
      pink: override.text?.pink ?? base.text.pink,
      gray: override.text?.gray ?? base.text.gray,
      muted: override.text?.muted ?? base.text.muted,
      white: override.text?.white ?? base.text.white,
      green: override.text?.green ?? base.text.green,
      yellow: override.text?.yellow ?? base.text.yellow,
      red: override.text?.red ?? base.text.red,
      purple: override.text?.purple ?? base.text.purple,
      action: override.text?.action ?? base.text.action,
      ai: override.text?.ai ?? base.text.ai,
      arch: override.text?.arch ?? base.text.arch,
      info: override.text?.info ?? base.text.info,
      success: override.text?.success ?? base.text.success,
      warning: override.text?.warning ?? base.text.warning,
      error: override.text?.error ?? base.text.error,
    },
    background: {
      surface: override.background?.surface ?? base.background.surface,
      surfaceSoft: override.background?.surfaceSoft ?? base.background.surfaceSoft,
      user: override.background?.user ?? base.background.user,
      diffAdd: override.background?.diffAdd ?? base.background.diffAdd,
      diffDelete: override.background?.diffDelete ?? base.background.diffDelete,
    },
    spinner: override.spinner ?? base.spinner,
  };
}

export function textToken(token: TerminalTextToken): string {
  const style = [];
  if (token.bold) style.push(BOLD);
  if (token.dim) style.push(DIM);
  if (token.color) style.push(fg(token.color.r, token.color.g, token.color.b));
  return style.join("");
}

export function bgToken(color: RgbColor): string {
  return bg(color.r, color.g, color.b);
}

export let C_CYAN = "";
export let C_BLUE = "";
export let C_PINK = "";
export let C_GRAY = "";
export let C_MUTED = "";
export let C_WHITE = "";
export let C_GREEN = "";
export let C_YELLOW = "";
export let C_RED = "";
export let C_PURPLE = "";

export let C_ACTION = "";
export let C_AI = "";
export let C_ARCH = "";
export let C_INFO = "";
export let C_SUCCESS = "";
export let C_WARNING = "";
export let C_ERROR = "";
export const C_DIM = DIM;

export let BG_SURFACE = "";
export let BG_SURFACE_SOFT = "";
export let BG_USER = "";
export let BG_DIFF_ADD = "";
export let BG_DIFF_DELETE = "";

export let SPINNER: readonly string[] = [];

function refreshThemeExports(): void {
  C_CYAN = textToken(activeTheme.text.cyan);
  C_BLUE = textToken(activeTheme.text.blue);
  C_PINK = textToken(activeTheme.text.pink);
  C_GRAY = textToken(activeTheme.text.gray);
  C_MUTED = textToken(activeTheme.text.muted);
  C_WHITE = textToken(activeTheme.text.white);
  C_GREEN = textToken(activeTheme.text.green);
  C_YELLOW = textToken(activeTheme.text.yellow);
  C_RED = textToken(activeTheme.text.red);
  C_PURPLE = textToken(activeTheme.text.purple);
  C_ACTION = textToken(activeTheme.text.action);
  C_AI = textToken(activeTheme.text.ai);
  C_ARCH = textToken(activeTheme.text.arch);
  C_INFO = textToken(activeTheme.text.info);
  C_SUCCESS = textToken(activeTheme.text.success);
  C_WARNING = textToken(activeTheme.text.warning);
  C_ERROR = textToken(activeTheme.text.error);
  BG_SURFACE = bgToken(activeTheme.background.surface);
  BG_SURFACE_SOFT = bgToken(activeTheme.background.surfaceSoft);
  BG_USER = bgToken(activeTheme.background.user);
  BG_DIFF_ADD = bgToken(activeTheme.background.diffAdd);
  BG_DIFF_DELETE = bgToken(activeTheme.background.diffDelete);
  SPINNER = activeTheme.spinner;
}

refreshThemeExports();

// ?1000h = button events, ?1002h = button-motion (needed for drag/selection), ?1006h = SGR coords
export const ENABLE_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
export const DISABLE_MOUSE_TRACKING = "\x1b[?1000l\x1b[?1002l\x1b[?1006l";

export { BOLD, DIM, RESET };
