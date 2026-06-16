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

export function buildUnifiedDiff(
  fileName: string,
  oldLines: string[],
  newLines: string[],
): string {
  const changes = diffLines(oldLines, newLines);

  if (changes.every((c) => c.type === "equal")) {
    return `--- a/${fileName}\n+++ b/${fileName}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
  }

  const sections: Array<{
    oldStart: number;
    oldLen: number;
    newStart: number;
    newLen: number;
    lines: string[];
  }> = [];

  let currentSection: typeof sections[0] | null = null;
  let oldPos = 0;
  let newPos = 0;

  for (const change of changes) {
    if (change.type === "equal") {
      if (currentSection) {
        sections.push(currentSection);
        currentSection = null;
      }
      oldPos += change.content.length;
      newPos += change.content.length;
    } else {
      if (!currentSection) {
        currentSection = {
          oldStart: oldPos + 1,
          oldLen: 0,
          newStart: newPos + 1,
          newLen: 0,
          lines: [],
        };
      }

      for (const line of change.content) {
        if (change.type === "remove") {
          currentSection.oldLen++;
          currentSection.lines.push("-" + line);
        } else if (change.type === "insert") {
          currentSection.newLen++;
          currentSection.lines.push("+" + line);
        }
      }
      oldPos += change.content.length;
      newPos += change.content.length;
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  const parts: string[] = [];

  for (const section of sections) {
    parts.push(`--- a/${fileName}`);
    parts.push(`+++ b/${fileName}`);
    parts.push(
      `@@ -${section.oldStart},${section.oldLen} +${section.newStart},${section.newLen} @@`,
    );
    parts.push(...section.lines);
  }

  return parts.join("\n");
}
