import type terminalKit from "terminal-kit";
type Terminal = typeof terminalKit.terminal;
import cfonts from "cfonts";
import type { UIState } from "../store.js";
import { getModeDisplay } from "../../commands/route-policy.js";
import {
  colorByMode,
  stripAnsi,
  drawBoxEnd,
  drawBoxRow,
  centerText,
} from "./helpers.js";

export function renderHeader(term: Terminal, state: UIState): void {
  const { config } = state;
  const modeInfo = getModeDisplay(config.mode);
  const width = state.viewport.width;
  const compact = width < 80;

  term("\n");

  // ─── Banner ──────────────────────────────────────────
  renderBanner(term, width);

  // ─── Startup Card ────────────────────────────────────
  renderStartupCard(term, state, config, modeInfo, width, compact);

  term("\n");
}

// ─── Banner ──────────────────────────────────────────────

function renderBanner(term: Terminal, width: number): void {
  const text = width < 90 ? "CodeMap" : "CODEMAP";

  const result = cfonts.render(text, {
    font: width < 90 ? "simple" : "block",
    colors: ["system"],
    gradient: ["cyan", "magenta"],
    align: "center",
    letterSpacing: 1,
    lineHeight: 1,
    env: "node",
    space: true,
  });

  if (result && result.array.length) {
    for (const raw of result.array) {
      const line = raw.replace(/\s+$/, "");
      term(line);
      term("\n");
    }
  }

  centerText(
    term,
    "AI-powered code intelligence & agent platform",
    width,
    (t, s) => t.brightCyan(s),
  );
}

// ─── Startup Card ────────────────────────────────────────

function renderStartupCard(
  term: Terminal,
  state: UIState,
  config: UIState["config"],
  modeInfo: { label: string },
  width: number,
  compact: boolean,
): void {
  const boxW = Math.min(width - 4, compact ? 44 : 60);
  const innerW = boxW - 2;
  const pad = Math.max(0, Math.floor((width - boxW) / 2));
  const sp = " ".repeat(pad);
  const bc = (t: Terminal, s: string) => t.dim.gray(s);
  const hLine = "─".repeat(innerW);

  // Top border
  term(sp);
  bc(term, "┌");
  bc(term, "─┤ ");
  term.bold.cyan("Session");
  bc(term, " ├" + hLine.slice("Session".length + 4) + "┐");
  term("\n");

  // Version
  drawBoxRow(
    term,
    sp,
    innerW,
    "Version",
    "v0.1.0",
    (t, v) => t.dim.white(v),
    bc,
  );

  // Model
  drawBoxRow(term, sp, innerW, "Model", config.model, (t, v) => t.cyan(v), bc);

  // Mode
  drawBoxRow(
    term,
    sp,
    innerW,
    "Mode",
    modeInfo.label,
    (t, v) => colorByMode(t, config.mode, v),
    bc,
  );

  // Profile
  drawBoxRow(
    term,
    sp,
    innerW,
    "Profile",
    config.profile,
    (t, v) => t.white(v),
    bc,
  );

  // Gateway / available models
  if (config.availableModels.length > 0) {
    drawBoxRow(
      term,
      sp,
      innerW,
      "Models",
      `${config.availableModels.length} available`,
      (t, v) => t.green(v),
      bc,
    );
  }

  // MCP status
  drawBoxRow(term, sp, innerW, "MCP", "Connected", (t, v) => t.green(v), bc);

  // Git branch (if available from viewport/state - use placeholder)
  drawBoxRow(term, sp, innerW, "Branch", "master", (t, v) => t.magenta(v), bc);

  // Bottom border
  drawBoxEnd(term, sp, innerW, bc);
}
