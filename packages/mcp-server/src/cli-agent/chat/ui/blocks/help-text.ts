import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import type { UIState } from "../store.js";
import { drawKeycap } from "./helpers.js";

export function renderHelpText(term: Terminal, _state: UIState): void {
  term("\n  ");
  drawKeycap(term, "/", "commands");
  drawKeycap(term, "@", "files");
  drawKeycap(term, "Tab", "suggestions");
  drawKeycap(term, "Ctrl+C", "cancel");
  drawKeycap(term, "?", "help");
  term("\n");
}
