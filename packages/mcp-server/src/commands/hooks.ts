import path from "node:path";
import { readLocalIndex } from "../lib/local-index.js";
import { tryGetCurrentWorkspaceInfo } from "../lib/workspace-git.js";

export async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => resolve(""), 500);
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString("utf8")); });
    process.stdin.on("error", () => { clearTimeout(timer); resolve(""); });
  });
}

function formatAge(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export async function runSessionHintCommand(): Promise<void> {
  let userPrompt = "";
  if (!process.stdin.isTTY) {
    try {
      const raw = await readStdin();
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as { prompt?: string };
        userPrompt = parsed.prompt ?? "";
      }
    } catch { /* not JSON */ }
  }

  const store = await readLocalIndex();
  if (!store) {
    console.log("[CodeMap] No local index found.");
    console.log("→ REQUIRED: Call refresh_local_index before reading or editing files.");
    return;
  }

  const meta = store.getMeta();
  const summary = store.getSummary();
  const projectName = path.basename(summary.workspaceRootPath);
  const indexedAgo = meta?.indexedAt ? formatAge(new Date(meta.indexedAt)) : "never";

  let isStale = false;
  if (meta?.commitSha && meta.workspaceRootPath) {
    const gitInfo = await tryGetCurrentWorkspaceInfo(meta.workspaceRootPath).catch(() => null);
    if (gitInfo && gitInfo.commitSha !== meta.commitSha) isStale = true;
  }

  const broadTaskPattern = /\b(implement|fix|debug|refactor|investigate|add|create|update|review|build|write|make|change|rename|move|delete|migrate|optimize|improve|deploy|integrate|sửa|thêm|tạo|xóa|làm|viết|đổi|cập nhật)\b/i;
  const isBroadTask = userPrompt.length > 15 && broadTaskPattern.test(userPrompt);

  const lines: string[] = [
    `[CodeMap] ${projectName} · ${summary.fileCount} files · ${summary.symbolCount} symbols · indexed ${indexedAgo}`,
  ];

  if (isStale) {
    lines.push(`⚠ Index is STALE (was at ${meta!.commitSha!.slice(0, 7)}, HEAD has moved). Blast radius data is outdated.`);
    lines.push("→ REQUIRED: Call refresh_local_index before reading or editing files.");
  }

  if (isBroadTask) {
    lines.push("→ REQUIRED: Gather repo context before reading files or editing.");
    lines.push("  Use explore_task when files are unclear; inspect exact files/symbols directly when already known.");
  } else {
    lines.push("→ For broad tasks with unclear files, call explore_task(task) first.");
  }

  console.log(lines.join("\n"));
}

const HIGH_BLAST_THRESHOLD = 10;

export async function runPreEditCommand(args: string[]): Promise<void> {
  let filePath: string | null = null;

  const fileArgIdx = args.indexOf("--file");
  if (fileArgIdx >= 0 && args[fileArgIdx + 1]) {
    filePath = args[fileArgIdx + 1] ?? null;
  } else if (!process.stdin.isTTY) {
    try {
      const raw = await readStdin();
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as { tool_input?: { file_path?: string; path?: string } };
        filePath = parsed.tool_input?.file_path ?? parsed.tool_input?.path ?? null;
      }
    } catch { /* not JSON */ }
  }

  if (!filePath) return;

  const store = await readLocalIndex();
  if (!store) return;

  const meta = store.getMeta();
  let isStale = false;
  if (meta?.commitSha && meta.workspaceRootPath) {
    const gitInfo = await tryGetCurrentWorkspaceInfo(meta.workspaceRootPath).catch(() => null);
    if (gitInfo && gitInfo.commitSha !== meta.commitSha) isStale = true;
  }

  const data = store.getFileParse(filePath);
  if (!data) return;

  const lines: string[] = [`[CodeMap] Pre-edit: ${filePath}`];

  if (isStale) {
    lines.push("⚠ INDEX STALE — blast radius below may be inaccurate. Call refresh_local_index first.");
  }

  const resolvedImports = data.imports.filter((i) => i.targetPathText);
  if (resolvedImports.length > 0) {
    const shown = resolvedImports.slice(0, 6).map((i) => path.basename(i.targetPathText!));
    const rest = resolvedImports.length - shown.length;
    lines.push(`Imports (${resolvedImports.length}): ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`);
  }

  const blastCount = data.blastRadius.totalCount;
  if (blastCount >= HIGH_BLAST_THRESHOLD) {
    const shown = data.blastRadius.files.slice(0, 5).map((f) => path.basename(f.path));
    const rest = blastCount - shown.length;
    lines.push(`⚠ HIGH BLAST RADIUS (${blastCount} files): ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`);
    lines.push("→ REQUIRED: Call find_related_files or explore_task before editing this file.");
  } else if (blastCount > 0) {
    const shown = data.blastRadius.files.slice(0, 5).map((f) => path.basename(f.path));
    const rest = blastCount - shown.length;
    lines.push(`Blast radius (${blastCount}): ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`);
  }

  const exportedNames = data.exports.map((e) => e.exportName);
  if (exportedNames.length > 0) {
    const shown = exportedNames.slice(0, 8);
    const rest = exportedNames.length - shown.length;
    lines.push(`Exports: ${shown.join(", ")}${rest > 0 ? ` +${rest} more` : ""}`);
  }

  if (store.hasCycle(filePath)) {
    lines.push("⚠ CYCLE DETECTED — this file is in an import cycle. Verify with find_cycles after editing.");
  } else {
    lines.push("Cycle risk: none detected");
  }

  console.log(lines.join("\n"));
}

export async function runPreReadCommand(): Promise<void> {
  if (process.stdin.isTTY) return;

  let filePath: string | null = null;
  try {
    const raw = await readStdin();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { tool_input?: { file_path?: string; path?: string } };
      filePath = parsed.tool_input?.file_path ?? parsed.tool_input?.path ?? null;
    }
  } catch { return; }

  if (!filePath) return;

  const store = await readLocalIndex();
  if (!store) return;

  const data = store.getFileParse(filePath);
  if (!data) return;

  const lines: string[] = [`[CodeMap] Read gate: ${filePath}`];

  if (data.symbols.length > 0 || data.exports.length > 0) {
    lines.push(`This file is indexed — ${data.symbols.length} symbols, ${data.exports.length} exports.`);
    lines.push("→ REQUIRED: Use get_file(include=[\"symbols\"], symbol_names=[...]) to read specific symbols.");
    lines.push("  Use get_file(include=[\"outline\"]) to survey the file structure.");
    lines.push("  Only use Read for raw content not available in the index (e.g. config files, templates).");
  }

  console.log(lines.join("\n"));
}

export async function runPreBashCommand(): Promise<void> {
  if (process.stdin.isTTY) return;

  let command: string | null = null;
  try {
    const raw = await readStdin();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { tool_input?: { command?: string } };
      command = parsed.tool_input?.command ?? null;
    }
  } catch { return; }

  if (!command) return;

  const codeSearchPattern = /\b(grep|rg|awk|sed)\b.*\.(ts|tsx|js|jsx|py|go|rs|java|css|scss)/;
  const rawReadPattern = /\b(cat|head|tail)\b.*\.(ts|tsx|js|jsx|py|go|rs|java)/;

  if (codeSearchPattern.test(command)) {
    console.log("[CodeMap] Bash gate: grep/awk/sed detected on source files.");
    console.log("→ REQUIRED: Use search_codebase(query) for symbol/keyword lookup.");
    console.log("  Use symbol(action=usages) or symbol(action=callers) for impact analysis.");
    console.log("  Use Bash grep only for dynamic access patterns, string literals, or files not in the index.");
    return;
  }

  if (rawReadPattern.test(command)) {
    console.log("[CodeMap] Bash gate: cat/head/tail detected on source files.");
    console.log("→ REQUIRED: Use get_file(include=[\"symbols\"]) or get_file(include=[\"outline\"]) instead.");
    console.log("  Use Read tool only when MCP get_file is insufficient.");
  }
}
