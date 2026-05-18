import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

type LineOp = { type: "add"; newLine: number; text: string } | { type: "delete"; oldLine: number; text: string };

interface ChangeBlock {
  type: "add" | "delete" | "change";
  oldStart?: number;
  oldEnd?: number;
  newStart?: number;
  newEnd?: number;
}

const MAX_DIFF_CELLS = 200_000;
const MAX_PREVIEW_LINES = 80;


function rangeLabel(start?: number, end?: number): string {
  if (start === undefined || end === undefined) return "-";
  return start === end ? String(start) : `${start}-${end}`;
}

function buildLineOps(oldLines: string[], newLines: string[]): LineOp[] {
  if (oldLines.length * newLines.length > MAX_DIFF_CELLS) {
    return [
      ...oldLines.map((text, idx) => ({ type: "delete" as const, oldLine: idx + 1, text })),
      ...newLines.map((text, idx) => ({ type: "add" as const, newLine: idx + 1, text })),
    ];
  }

  const dp = Array.from({ length: oldLines.length + 1 }, () =>
    Array<number>(newLines.length + 1).fill(0),
  );
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      dp[i]![j] = oldLines[i] === newLines[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else if (j < newLines.length && (i === oldLines.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      ops.push({ type: "add", newLine: j + 1, text: newLines[j]! });
      j++;
    } else if (i < oldLines.length) {
      ops.push({ type: "delete", oldLine: i + 1, text: oldLines[i]! });
      i++;
    }
  }
  return ops;
}

function buildChangeBlocks(ops: LineOp[]): ChangeBlock[] {
  const blocks: ChangeBlock[] = [];
  let pending: LineOp[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    const deletes = pending.filter((op): op is Extract<LineOp, { type: "delete" }> => op.type === "delete");
    const adds = pending.filter((op): op is Extract<LineOp, { type: "add" }> => op.type === "add");
    blocks.push({
      type: deletes.length > 0 && adds.length > 0 ? "change" : deletes.length > 0 ? "delete" : "add",
      oldStart: deletes[0]?.oldLine,
      oldEnd: deletes.at(-1)?.oldLine,
      newStart: adds[0]?.newLine,
      newEnd: adds.at(-1)?.newLine,
    });
    pending = [];
  };

  for (const op of ops) {
    const last = pending.at(-1);
    const adjacent =
      !last ||
      (op.type === "add" && last.type === "add" && op.newLine === last.newLine + 1) ||
      (op.type === "delete" && last.type === "delete" && op.oldLine === last.oldLine + 1) ||
      (op.type !== last.type);
    if (!adjacent) flush();
    pending.push(op);
  }
  flush();
  return blocks;
}

function buildWritePreview(filePath: string, oldContent: string | null, newContent: string): string {
  const exists = oldContent !== null;
  const oldLines = exists ? oldContent.split("\n") : [];
  const newLines = newContent.split("\n");
  const ops = exists
    ? buildLineOps(oldLines, newLines)
    : newLines.map((text, idx) => ({ type: "add" as const, newLine: idx + 1, text }));
  const additions = ops.filter((op) => op.type === "add").length;
  const deletions = ops.filter((op) => op.type === "delete").length;
  const blocks = buildChangeBlocks(ops);
  const oldBytes = exists ? Buffer.byteLength(oldContent, "utf-8") : 0;
  const newBytes = Buffer.byteLength(newContent, "utf-8");
  const lines = [
    `Write preview: ${filePath}`,
    `Mode: ${exists ? "overwrite" : "create"}`,
    `Size: ${exists ? `${oldBytes} -> ${newBytes}` : newBytes} bytes`,
    `Lines: +${additions} -${deletions}`,
    "",
    "Changes:",
  ];

  if (blocks.length === 0) {
    lines.push("  no line changes");
  } else {
    for (const block of blocks.slice(0, 12)) {
      const marker = block.type === "add" ? "+" : block.type === "delete" ? "-" : "~";
      const label = block.type === "add"
        ? `${rangeLabel(block.newStart, block.newEnd)}`
        : block.type === "delete"
          ? `${rangeLabel(block.oldStart, block.oldEnd)}`
          : `${rangeLabel(block.oldStart, block.oldEnd)} -> ${rangeLabel(block.newStart, block.newEnd)}`;
      const text = block.type === "add" ? "Added" : block.type === "delete" ? "Removed" : "Changed";
      lines.push(`${marker} ${label.padEnd(12)} ${text}`);
    }
    if (blocks.length > 12) lines.push(`... ${blocks.length - 12} more block(s)`);
  }

  // Generate proper unified diff so renderUnifiedDiff can parse it and apply Shiki highlighting.
  // Use basename for the diff path labels to keep headers clean and parseable.
  const diffLabel = filePath.split("/").pop() ?? filePath;
  const shownOps = ops.slice(0, MAX_PREVIEW_LINES);
  const oldTotal = exists ? oldLines.length : 0;
  const newTotal = newLines.length;
  const hunkOldRange = `0,${Math.min(oldTotal, shownOps.length)}`;
  const hunkNewRange = `0,${Math.min(newTotal, shownOps.length)}`;
  lines.push("", "```diff", exists ? `--- a/${diffLabel}` : "--- /dev/null", `+++ b/${diffLabel}`);
  lines.push(`@@ -${hunkOldRange} +${hunkNewRange} @@ ${diffLabel}`);
  for (const op of shownOps) {
    if (op.type === "add") lines.push(`+${op.text}`);
    else lines.push(`-${op.text}`);
  }
  if (ops.length > MAX_PREVIEW_LINES) {
    lines.push(`... ${ops.length - MAX_PREVIEW_LINES} more line(s)`);
  }
  lines.push("```");

  return lines.join("\n");
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerWriteFileTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "write_file",
    {
      title: "Write File",
      description:
        "Write content to a file, creating it if it doesn't exist. " +
        "Overwrites the entire file. For targeted edits, use edit_file instead.",
      inputSchema: {
        file_path: z
          .string()
          .describe("The absolute path to the file."),
        content: z
          .string()
          .describe("The full content to write."),
        dry_run: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Show what would be written without writing. Default: false.",
          ),
      },
    },
    withToolError(async ({ file_path, content, dry_run }) => {
      const workspacePath = await readWorkspacePath();
      const absPath = resolve(workspacePath, file_path);

      // Check if file exists (for reporting)
      let exists = false;
      let oldContent: string | null = null;
      try {
        oldContent = await readFile(absPath, "utf-8");
        exists = true;
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }

      const result = {
        applied: false,
        dryRun: Boolean(dry_run),
        filePath: file_path,
        created: !exists,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      };

      if (dry_run) {
        const preview = buildWritePreview(file_path, oldContent, content);
        return success(preview, result);
      }

      // Ensure parent directory exists
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, "utf-8");
      result.applied = true;

      return success(
        `### File ${exists ? "Written" : "Created"}\n\n` +
          `File: \`${file_path}\`\n` +
          `Size: ${result.bytesWritten} bytes`,
        result,
      );
    }),
  );
}
