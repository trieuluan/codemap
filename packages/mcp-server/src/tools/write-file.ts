import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspacePath } from "../lib/workspace-project.js";

// ─── types ───────────────────────────────────────────────────────────────────

type LineOp =
  | { type: "add"; newLine: number; text: string }
  | { type: "delete"; oldLine: number; text: string };

interface ChangeBlock {
  type: "add" | "delete" | "change";
  oldStart?: number;
  oldEnd?: number;
  newStart?: number;
  newEnd?: number;
}

interface WriteFileResult extends Record<string, unknown> {
  applied: boolean;
  dryRun: boolean;
  filePath: string;
  created: boolean;
  bytesWritten: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const MAX_DIFF_CELLS = 200_000;
const MAX_CHANGE_BLOCKS = 12;

function rangeLabel(start?: number, end?: number): string {
  if (start === undefined || end === undefined) return "-";
  return start === end ? String(start) : `${start}-${end}`;
}

function buildFallbackLineOps(
  oldLines: string[],
  newLines: string[],
): LineOp[] {
  return [
    ...oldLines.map((text, idx) => ({
      type: "delete" as const,
      oldLine: idx + 1,
      text,
    })),
    ...newLines.map((text, idx) => ({
      type: "add" as const,
      newLine: idx + 1,
      text,
    })),
  ];
}

function buildLineOps(oldLines: string[], newLines: string[]): LineOp[] {
  if (oldLines.length * newLines.length > MAX_DIFF_CELLS) {
    return buildFallbackLineOps(oldLines, newLines);
  }

  const dp = Array.from({ length: oldLines.length + 1 }, () =>
    Array<number>(newLines.length + 1).fill(0),
  );

  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      dp[i]![j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (
      i < oldLines.length &&
      j < newLines.length &&
      oldLines[i] === newLines[j]
    ) {
      i++;
      j++;
    } else if (
      j < newLines.length &&
      (i === oldLines.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)
    ) {
      ops.push({ type: "add", newLine: j + 1, text: newLines[j]! });
      j++;
    } else if (i < oldLines.length) {
      ops.push({ type: "delete", oldLine: i + 1, text: oldLines[i]! });
      i++;
    }
  }

  return ops;
}

function areAdjacentLineOps(
  previous: LineOp | undefined,
  current: LineOp,
): boolean {
  return (
    !previous ||
    (current.type === "add" &&
      previous.type === "add" &&
      current.newLine === previous.newLine + 1) ||
    (current.type === "delete" &&
      previous.type === "delete" &&
      current.oldLine === previous.oldLine + 1) ||
    current.type !== previous.type
  );
}

function buildChangeBlocks(ops: LineOp[]): ChangeBlock[] {
  const blocks: ChangeBlock[] = [];
  let pending: LineOp[] = [];

  const flush = () => {
    if (pending.length === 0) return;

    const deletes = pending.filter(
      (op): op is Extract<LineOp, { type: "delete" }> => op.type === "delete",
    );
    const adds = pending.filter(
      (op): op is Extract<LineOp, { type: "add" }> => op.type === "add",
    );

    blocks.push({
      type:
        deletes.length > 0 && adds.length > 0
          ? "change"
          : deletes.length > 0
            ? "delete"
            : "add",
      oldStart: deletes[0]?.oldLine,
      oldEnd: deletes.at(-1)?.oldLine,
      newStart: adds[0]?.newLine,
      newEnd: adds.at(-1)?.newLine,
    });
    pending = [];
  };

  for (const op of ops) {
    if (!areAdjacentLineOps(pending.at(-1), op)) flush();
    pending.push(op);
  }

  flush();
  return blocks;
}

function buildWriteLineOps(
  oldContent: string | null,
  newContent: string,
): LineOp[] {
  const newLines = newContent.split("\n");
  if (oldContent === null) {
    return newLines.map((text, idx) => ({
      type: "add",
      newLine: idx + 1,
      text,
    }));
  }
  return buildLineOps(oldContent.split("\n"), newLines);
}

function appendChangeSummary(lines: string[], blocks: ChangeBlock[]) {
  lines.push("", "Changes:");

  if (blocks.length === 0) {
    lines.push("  no line changes");
    return;
  }

  for (const block of blocks.slice(0, MAX_CHANGE_BLOCKS)) {
    const marker =
      block.type === "add" ? "+" : block.type === "delete" ? "-" : "~";
    const label =
      block.type === "add"
        ? rangeLabel(block.newStart, block.newEnd)
        : block.type === "delete"
          ? rangeLabel(block.oldStart, block.oldEnd)
          : `${rangeLabel(block.oldStart, block.oldEnd)} -> ${rangeLabel(block.newStart, block.newEnd)}`;
    const text =
      block.type === "add"
        ? "Added"
        : block.type === "delete"
          ? "Removed"
          : "Changed";
    lines.push(`${marker} ${label.padEnd(12)} ${text}`);
  }

  if (blocks.length > MAX_CHANGE_BLOCKS) {
    lines.push(`... ${blocks.length - MAX_CHANGE_BLOCKS} more block(s)`);
  }
}

const DIFF_CONTEXT = 3;

// Replay ops + context lines → list of hunks, like git diff -U3.
function buildUnifiedHunks(
  oldLines: string[],
  newLines: string[],
  ops: LineOp[],
) {
  type Event =
    | { kind: "ctx"; oldLine: number; newLine: number; text: string }
    | { kind: "del"; oldLine: number; text: string }
    | { kind: "add"; newLine: number; text: string };

  const events: Event[] = [];
  let oi = 1,
    ni = 1,
    opIdx = 0;

  while (oi <= oldLines.length || ni <= newLines.length) {
    const op = ops[opIdx];
    if (op?.type === "delete" && op.oldLine === oi) {
      events.push({ kind: "del", oldLine: oi, text: oldLines[oi - 1]! });
      oi++;
      opIdx++;
    } else if (op?.type === "add" && op.newLine === ni) {
      events.push({ kind: "add", newLine: ni, text: newLines[ni - 1]! });
      ni++;
      opIdx++;
    } else if (oi <= oldLines.length && ni <= newLines.length) {
      events.push({
        kind: "ctx",
        oldLine: oi,
        newLine: ni,
        text: oldLines[oi - 1]!,
      });
      oi++;
      ni++;
    } else break;
  }

  const changedIdx = events.reduce<number[]>((a, e, i) => {
    if (e.kind !== "ctx") a.push(i);
    return a;
  }, []);
  if (changedIdx.length === 0) return [];

  // Merge nearby changed regions into clusters separated by > 2*DIFF_CONTEXT context lines.
  const clusters: Array<[number, number]> = [];
  let cs = changedIdx[0]!,
    ce = changedIdx[0]!;
  for (let k = 1; k < changedIdx.length; k++) {
    if (changedIdx[k]! - ce <= 2 * DIFF_CONTEXT + 1) {
      ce = changedIdx[k]!;
    } else {
      clusters.push([cs, ce]);
      cs = changedIdx[k]!;
      ce = changedIdx[k]!;
    }
  }
  clusters.push([cs, ce]);

  return clusters.map(([clStart, clEnd]) => {
    const from = Math.max(0, clStart - DIFF_CONTEXT);
    const to = Math.min(events.length - 1, clEnd + DIFF_CONTEXT);
    const slice = events.slice(from, to + 1);

    const firstOld = slice.find(
      (e): e is Extract<Event, { kind: "ctx" | "del" }> =>
        e.kind === "ctx" || e.kind === "del",
    );
    const firstNew = slice.find(
      (e): e is Extract<Event, { kind: "ctx" | "add" }> =>
        e.kind === "ctx" || e.kind === "add",
    );
    const oldStart = firstOld?.oldLine ?? 0;
    const newStart = firstNew?.newLine ?? 1;
    const oldCount = slice.filter((e) => e.kind !== "add").length;
    const newCount = slice.filter((e) => e.kind !== "del").length;

    return { oldStart, oldCount, newStart, newCount, lines: slice };
  });
}

function appendUnifiedDiff(
  out: string[],
  filePath: string,
  oldContent: string | null,
  newContent: string,
  ops: LineOp[],
) {
  const diffLabel = filePath.split("/").pop() ?? filePath;
  const oldLines = oldContent?.split("\n") ?? [];
  const newLines = newContent.split("\n");
  const hunks = buildUnifiedHunks(oldLines, newLines, ops);

  out.push(
    "",
    "```diff",
    oldContent === null ? "--- /dev/null" : `--- a/${diffLabel}`,
    `+++ b/${diffLabel}`,
  );

  for (const hunk of hunks) {
    const oldRange =
      hunk.oldCount === 1
        ? `${hunk.oldStart}`
        : `${hunk.oldStart},${hunk.oldCount}`;
    const newRange =
      hunk.newCount === 1
        ? `${hunk.newStart}`
        : `${hunk.newStart},${hunk.newCount}`;
    out.push(
      `@@ -${hunk.oldStart === 0 ? "0,0" : oldRange} +${newRange} @@ ${diffLabel}`,
    );
    for (const e of hunk.lines) {
      out.push(
        e.kind === "add"
          ? `+${e.text}`
          : e.kind === "del"
            ? `-${e.text}`
            : ` ${e.text}`,
      );
    }
  }

  out.push("```");
}

function buildWritePreview(
  filePath: string,
  oldContent: string | null,
  newContent: string,
): string {
  const exists = oldContent !== null;
  const ops = buildWriteLineOps(oldContent, newContent);
  const additions = ops.filter((op) => op.type === "add").length;
  const deletions = ops.filter((op) => op.type === "delete").length;
  const oldBytes = exists ? Buffer.byteLength(oldContent, "utf-8") : 0;
  const newBytes = Buffer.byteLength(newContent, "utf-8");
  const lines = [
    `Write preview: ${filePath}`,
    `Mode: ${exists ? "overwrite" : "create"}`,
    `Size: ${exists ? `${oldBytes} -> ${newBytes}` : newBytes} bytes`,
    `Lines: +${additions} -${deletions}`,
  ];

  appendChangeSummary(lines, buildChangeBlocks(ops));
  appendUnifiedDiff(lines, filePath, oldContent, newContent, ops);

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
        file_path: z.string().describe("The absolute path to the file."),
        content: z.string().describe("The full content to write."),
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

      let oldContent: string | null = null;
      try {
        oldContent = await readFile(absPath, "utf-8");
      } catch (err: any) {
        if (err.code !== "ENOENT") throw err;
      }

      const result: WriteFileResult = {
        applied: false,
        dryRun: Boolean(dry_run),
        filePath: file_path,
        created: oldContent === null,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      };

      if (dry_run) {
        return success(
          buildWritePreview(file_path, oldContent, content),
          result,
        );
      }

      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, "utf-8");
      result.applied = true;

      return success(
        `### File ${oldContent === null ? "Created" : "Written"}\n\n` +
          `File: \`${file_path}\`\n` +
          `Size: ${result.bytesWritten} bytes`,
        result,
      );
    }),
  );
}
