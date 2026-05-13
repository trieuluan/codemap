import type { UIState } from "../store.js";
import { bottomLineCount } from "./chat-screen.js";
import { messageContentLineCount } from "./message-renderer.js";

export function parseMouseWheel(data: string): -1 | 1 | null {
  const sgr = data.match(/^\x1b\[<(\d+);\d+;\d+M$/);
  if (!sgr) return null;
  const code = Number(sgr[1]);
  if (!Number.isFinite(code) || (code & 64) === 0) return null;
  return (code & 1) === 0 ? -1 : 1;
}

export function isSgrMouseEvent(data: string): boolean {
  return /^\x1b\[<\d+;\d+;\d+[mM]$/.test(data);
}

export function pageScrollStep(state: UIState): number {
  return Math.max(4, Math.floor((process.stdout.rows || state.viewport.height || 24) * 0.45));
}

export function wheelScrollStep(): number {
  return 3;
}

function maxMessageOffset(state: UIState): number {
  const width = process.stdout.columns || state.viewport.width || 80;
  const height = process.stdout.rows || state.viewport.height || 24;
  const contentHeight = Math.max(1, height - bottomLineCount(state));
  return Math.max(0, messageContentLineCount(state, width) - contentHeight);
}

export function clampMessageOffset(state: UIState, offset: number): number {
  return Math.max(0, Math.min(offset, maxMessageOffset(state)));
}
