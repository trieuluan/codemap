import { styleText } from "node:util";

interface DiffLine {
  type: "header" | "file" | "add" | "remove" | "context" | "hunk";
  content: string;
}

export function parseUnifiedDiff(diffText: string): DiffLine[] {
  const lines = diffText.split("\n");
  const result: DiffLine[] = [];

  for (const line of lines) {
    if (line.startsWith("---") || line.startsWith("+++")) {
      result.push({ type: "file", content: line });
    } else if (line.startsWith("@@")) {
      result.push({ type: "hunk", content: line });
    } else if (line.startsWith("+")) {
      result.push({ type: "add", content: line });
    } else if (line.startsWith("-")) {
      result.push({ type: "remove", content: line });
    } else if (line.startsWith("diff --git")) {
      result.push({ type: "header", content: line });
    } else {
      result.push({ type: "context", content: line });
    }
  }

  return result;
}

export function renderDiffPreview(diffText: string, maxLines: number = 200): string {
  const lines = parseUnifiedDiff(diffText);
  const output: string[] = [];
  let count = 0;

  for (const line of lines) {
    if (count >= maxLines) {
      output.push(styleText("gray", `\n... (truncated, ${lines.length - count} more lines)`));
      break;
    }

    switch (line.type) {
      case "header":
        output.push(styleText("bold", line.content));
        break;
      case "file":
        if (line.content.startsWith("---")) {
          output.push(styleText("red", line.content));
        } else {
          output.push(styleText("green", line.content));
        }
        break;
      case "hunk":
        output.push(styleText("cyan", line.content));
        break;
      case "add":
        output.push(styleText("green", line.content));
        break;
      case "remove":
        output.push(styleText("red", line.content));
        break;
      case "context":
        output.push(line.content);
        break;
    }
    count++;
  }

  return output.join("\n");
}

export function extractPatchFromDryRun(result: string): string | null {
  const patchStart = result.indexOf("---");
  if (patchStart === -1) return null;

  const patchEnd = result.indexOf("\n\n", patchStart);
  if (patchEnd === -1) return result.slice(patchStart);

  return result.slice(patchStart, patchEnd);
}
