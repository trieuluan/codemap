/**
 * Node.js terminal backend for terminui.
 * Implements the Backend interface using ANSI escape sequences on process.stdout.
 */
import type { Backend, Cell, Position } from "terminui";

interface NodeBackendState {
  prevBuffer: (Cell | null)[][];
  width: number;
  height: number;
}

const ESC = "\x1b";
const CSI = `${ESC}[`;

function createEmptyBuffer(w: number, h: number): (Cell | null)[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}

export function createNodeBackendState(): NodeBackendState {
  const w = process.stdout.columns || 80;
  const h = process.stdout.rows || 24;
  return { prevBuffer: createEmptyBuffer(w, h), width: w, height: h };
}

function cellToAnsi(cell: Cell): string {
  const codes: number[] = [];

  // Foreground
  if (cell.fg) {
    if (cell.fg.type === "rgb") {
      codes.push(38, 2, cell.fg.r, cell.fg.g, cell.fg.b);
    } else if (cell.fg.type === "indexed") {
      codes.push(38, 5, cell.fg.index);
    } else {
      const map: Record<string, number> = {
        black: 30, red: 31, green: 32, yellow: 33,
        blue: 34, magenta: 35, cyan: 36, gray: 37,
        "dark-gray": 90, "light-red": 91, "light-green": 92,
        "light-yellow": 93, "light-blue": 94, "light-magenta": 95,
        "light-cyan": 96, white: 97,
      };
      const c = map[cell.fg.type];
      if (c !== undefined) codes.push(c);
    }
  }

  // Background
  if (cell.bg) {
    if (cell.bg.type === "rgb") {
      codes.push(48, 2, cell.bg.r, cell.bg.g, cell.bg.b);
    } else if (cell.bg.type === "indexed") {
      codes.push(48, 5, cell.bg.index);
    } else {
      const map: Record<string, number> = {
        black: 40, red: 41, green: 42, yellow: 43,
        blue: 44, magenta: 45, cyan: 46, gray: 47,
        "dark-gray": 100, "light-red": 101, "light-green": 102,
        "light-yellow": 103, "light-blue": 104, "light-magenta": 105,
        "light-cyan": 106, white: 107,
      };
      const c = map[cell.bg.type];
      if (c !== undefined) codes.push(c);
    }
  }

  // Modifiers
  if (cell.modifier) {
    const modMap: Record<number, number> = {
      1: 1, 2: 2, 4: 3, 8: 4, 16: 5, 32: 6, 64: 7, 128: 8, 256: 9, 1024: 53,
    };
    for (const [flag, code] of Object.entries(modMap)) {
      if (cell.modifier & Number(flag)) codes.push(code);
    }
  }

  const prefix = codes.length > 0 ? `${CSI}${codes.join("m")}` : "";
  const reset = codes.length > 0 ? `${CSI}0m` : "";
  return `${prefix}${cell.symbol}${reset}`;
}

export function createNodeBackend(state: NodeBackendState): Backend {
  let cursorVisible = true;
  let cursorPos: Position = { x: 0, y: 0 };

  return {
    clear() {
      process.stdout.write(`${CSI}2J${CSI}H`);
      state.prevBuffer = createEmptyBuffer(state.width, state.height);
    },
    size() {
      return { width: state.width, height: state.height };
    },
    draw(content: readonly { x: number; y: number; cell: Cell }[]) {
      if (content.length === 0) return;
      const parts: string[] = [];
      for (const { x, y, cell } of content) {
        parts.push(`${CSI}${y + 1};${x + 1}H`);
        parts.push(cellToAnsi(cell));
        if (y < state.height && x < state.width) {
          state.prevBuffer[y]![x] = cell;
        }
      }
      // Reset style at end
      parts.push(`${CSI}0m`);
      process.stdout.write(parts.join(""));
    },
    flush() {
      // No-op: draw() writes directly
    },
    showCursor() {
      if (!cursorVisible) {
        process.stdout.write(`${CSI}?25h`);
        cursorVisible = true;
      }
    },
    hideCursor() {
      if (cursorVisible) {
        process.stdout.write(`${CSI}?25l`);
        cursorVisible = false;
      }
    },
    setCursorPosition(pos: Position) {
      cursorPos = pos;
      process.stdout.write(`${CSI}${pos.y + 1};${pos.x + 1}H`);
    },
    getCursorPosition() {
      return cursorPos;
    },
  };
}
