import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import type { UIState } from "../store.js";
import { getModeDisplay } from "../../commands/route-policy.js";
import { colorByMode } from "./helpers.js";

export function renderStatusLine(term: Terminal, state: UIState): void {
  const { config, input } = state;
  const modeInfo = getModeDisplay(config.mode);

  // Status bar with consistent style
  term("\n  ");
  term.dim.gray("│ ");
  term.gray("Model: ");
  term.cyan(config.model);
  term.dim.gray(" · ");
  term.gray("Mode: ");
  colorByMode(term, config.mode, modeInfo.label);
  term.dim.gray(" · ");
  term.gray("Debug: ");
  if (config.debug) {
    term.bold.red("On");
  } else {
    term.dim.gray("Off");
  }

  if (input.autoAccept) {
    term.dim.gray(" · ");
    term.bold.green("ACCEPT ALL");
  }

  term("\n");
}
