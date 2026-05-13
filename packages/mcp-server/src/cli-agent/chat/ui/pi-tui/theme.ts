import { BOLD, RESET, fg } from "../ink-utils.js";

export const C_CYAN = `${BOLD}${fg(0, 229, 255)}`;
export const C_GRAY = fg(107, 114, 128);
export const C_WHITE = fg(229, 231, 235);
export const C_GREEN = fg(34, 197, 94);
export const C_YELLOW = fg(250, 204, 21);
export const C_RED = fg(248, 113, 113);

export const COMMANDS = ["/help", "/model", "/models", "/mode", "/clear", "/compact", "/retry", "/debug"] as const;
export const SPINNER = ["|", "/", "-", "\\"] as const;

export const ENABLE_MOUSE_TRACKING = "\x1b[?1000h\x1b[?1006h";
export const DISABLE_MOUSE_TRACKING = "\x1b[?1000l\x1b[?1006l";

export { BOLD, RESET };
