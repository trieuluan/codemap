import type { Backend, Cell, Position } from "terminui";

export function createNodeBackend(): Backend {
  let prevBuffer: Cell[] = [];
  let prevW = 0;
  let prevH = 0;

  function clear(): void {
    process.stdout.write("\x1b[2J\x1b[H");
    prevBuffer = [];
  }

  function size(): { width: number; height: number } {
    return {
      width: process.stdout.columns || 80,
      height: process.stdout.rows || 24,
    };
  }

  function cellToAnsi(cell: Cell): string {
    const parts: string[] = [];

    if (cell.fg) {
      const fg = cell.fg;
      if (fg.type === "rgb") {
        parts.push(`38;2;${fg.r};${fg.g};${fg.b}`);
      } else if (fg.type === "indexed") {
        parts.push(`38;5;${fg.index}`);
      } else {
        const map: Record<string, string> = {
          black: "30", red: "31", green: "32", yellow: "33",
          blue: "34", magenta: "35", cyan: "36", white: "37",
          gray: "90", "dark-gray": "90",
          "light-red": "91", "light-green": "92", "light-yellow": "93",
          "light-blue": "94", "light-magenta": "95", "light-cyan": "96",
          reset: "0",
        };
        if (map[fg.type]) parts.push(map[fg.type]);
      }
    }

    if (cell.bg) {
      const bg = cell.bg;
      if (bg.type === "rgb") {
        parts.push(`48;2;${bg.r};${bg.g};${bg.b}`);
      } else if (bg.type === "indexed") {
        parts.push(`48;5;${bg.index}`);
      } else {
        const map: Record<string, string> = {
          black: "40", red: "41", green: "42", yellow: "43",
          blue: "44", magenta: "45", cyan: "46", white: "47",
          gray: "100", "dark-gray": "100",
          "light-red": "101", "light-green": "102", "light-yellow": "103",
          "light-blue": "104", "light-magenta": "105", "light-cyan": "106",
        };
        if (map[bg.type]) parts.push(map[bg.type]);
      }
    }

    if (cell.modifier) {
      const mod = cell.modifier;
      if (mod & 1) parts.push("1");   // BOLD
      if (mod & 2) parts.push("2");   // DIM
      if (mod & 4) parts.push("3");   // ITALIC
      if (mod & 8) parts.push("4");   // UNDERLINED
      if (mod & 16) parts.push("5");  // SLOW_BLINK
      if (mod & 64) parts.push("7");  // REVERSED
      if (mod & 128) parts.push("8"); // HIDDEN
      if (mod & 256) parts.push("9"); // CROSSED_OUT
    }

    return parts.length > 0 ? `\x1b[${parts.join(";")}m` : "";
  }

  function cellsEqual(a: Cell, b: Cell): boolean {
    return (
      a.symbol === b.symbol &&
      JSON.stringify(a.fg) === JSON.stringify(b.fg) &&
      JSON.stringify(a.bg) === JSON.stringify(b.bg) &&
      a.modifier === b.modifier
    );
  }

  function draw(content: readonly { readonly x: number; readonly y: number; readonly cell: Cell }[]): void {
    const { width, height } = size();
    if (width !== prevW || height !== prevH) {
      prevBuffer = [];
      prevW = width;
      prevH = height;
    }

    let out = "";
    let lastX = -1;
    let lastY = -1;

    for (const { x, y, cell } of content) {
      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;
      const prev = prevBuffer[idx];
      if (prev && cellsEqual(prev, cell)) continue;

      prevBuffer[idx] = { ...cell };

      if (y !== lastY || x !== lastX + 1) {
        out += `\x1b[${y + 1};${x + 1}H`;
      }
      out += cellToAnsi(cell) + cell.symbol + "\x1b[0m";

      lastX = x;
      lastY = y;
    }

    if (out) process.stdout.write(out);
  }

  function flush(): void {
    // ANSI backend flushes in draw() — nothing extra needed
  }

  function getCursorPosition(): Position {
    return { x: 0, y: 0 };
  }

  function setCursorPosition(_pos: Position): void {}

  function hideCursor(): void {
    process.stdout.write("\x1b[?25l");
  }

  function showCursor(): void {
    process.stdout.write("\x1b[?25h");
  }

  return {
    clear,
    size,
    draw,
    flush,
    getCursorPosition,
    setCursorPosition,
    hideCursor,
    showCursor,
  };
}
