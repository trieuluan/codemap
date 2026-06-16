/**
 * Simple LCS-based diff algorithm for generating unified diff output.
 */

export interface DiffChange {
  type: "equal" | "remove" | "insert";
  content: string[];
}

export function lcsMatrix(oldLines: string[], newLines: string[]): number[][] {
  const oldLen = oldLines.length;
  const newLen = newLines.length;
  const dp: number[][] = Array(oldLen + 1)
    .fill(null)
    .map(() => Array(newLen + 1).fill(0));

  for (let i = 1; i <= oldLen; i++) {
    for (let j = 1; j <= newLen; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

export function diffLines(oldLines: string[], newLines: string[]): DiffChange[] {
  const dp = lcsMatrix(oldLines, newLines);
  const changes: DiffChange[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      if (changes.length === 0 || changes[0].type !== "equal") {
        changes.unshift({ type: "equal", content: [] });
      }
      changes[0].content.unshift(oldLines[i - 1]);
      i--;
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
      changes.unshift({ type: "remove", content: [oldLines[i - 1]] });
      i--;
    } else {
      changes.unshift({ type: "insert", content: [newLines[j - 1]] });
      j--;
    }
  }

  return changes;
}

export interface BuildUnifiedDiffOptions {
  /** 1-based line number for the hunk header. Defaults to 1. */
  startLine?: number;
}

export function buildUnifiedDiff(
  fileName: string,
  oldLines: string[],
  newLines: string[],
  options?: BuildUnifiedDiffOptions,
): string {
  const changes = diffLines(oldLines, newLines);

  const header = `diff --git a/${fileName} b/${fileName}\n--- a/${fileName}\n+++ b/${fileName}\n`;
  const startLine = options?.startLine ?? 1;

  if (changes.every((c) => c.type === "equal")) {
    return `${header}@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@\n`;
  }

  // Emit all changes in a single hunk section — no artificial gaps
  // so the renderer shows the full diff without "N lines hidden" skip blocks.
  let oldPos = 0;
  let newPos = 0;
  const hunkLines: string[] = [];
  let hunkOldLen = 0;
  let hunkNewLen = 0;

  // Find the first non-equal change to set the start positions
  let hunkStarted = false;
  let hunkOldStart = startLine;
  let hunkNewStart = startLine;

  for (const change of changes) {
    if (change.type === "equal") {
      if (hunkStarted) {
        for (const line of change.content) {
          hunkLines.push(" " + line);
          hunkOldLen++;
          hunkNewLen++;
        }
      }
      oldPos += change.content.length;
      newPos += change.content.length;
    } else {
      if (!hunkStarted) {
        hunkStarted = true;
        hunkOldStart = startLine + oldPos;
        hunkNewStart = startLine + newPos;
      }
      for (const line of change.content) {
        if (change.type === "remove") {
          hunkOldLen++;
          hunkLines.push("-" + line);
        } else {
          hunkNewLen++;
          hunkLines.push("+" + line);
        }
      }
      oldPos += change.content.length;
      newPos += change.content.length;
    }
  }

  return `${header}@@ -${hunkOldStart},${hunkOldLen} +${hunkNewStart},${hunkNewLen} @@\n${hunkLines.join("\n")}`;
}
