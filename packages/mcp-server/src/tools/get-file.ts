import { stat, readFile } from "node:fs/promises";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { text, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId, readWorkspacePath } from "../lib/workspace-project.js";
import type { FileContent, BlastRadius, FileSyncResult } from "../lib/api-types.js";

// ─── types from /map/files/parse ─────────────────────────────────────────────

interface ParseFileInfo {
  path: string;
  language: string | null;
  lineCount: number | null;
  parseStatus: string;
  sizeBytes: number | null;
  extension: string | null;
}

interface ParseImport {
  moduleSpecifier: string;
  importKind: string;
  isResolved: boolean;
  targetPathText: string | null;
  targetExternalSymbolKey: string | null;
  startLine: number;
}

interface ParseImportedBy {
  sourceFilePath: string;
  moduleSpecifier: string;
  importKind: string;
  startLine: number;
}

interface ParseExport {
  exportName: string;
  exportKind: string;
  symbolDisplayName: string | null;
  startLine: number;
}

interface ParseSymbol {
  id: string;
  displayName: string;
  kind: string;
  signature: string | null;
  isExported: boolean;
  parentSymbolName: string | null;
  startLine: number | null;
}

interface ParseCycle {
  paths: string[];
  edgeCount: number;
  kind: "direct" | "scc";
  summary: string;
}

interface FileParseResponse {
  file: ParseFileInfo;
  imports: ParseImport[];
  importedBy: ParseImportedBy[];
  exports: ParseExport[];
  symbols: ParseSymbol[];
  blastRadius: BlastRadius;
  cycles: ParseCycle[];
}

// ─── formatters ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildContentSection(file: FileContent): string {
  const parts: string[] = [];
  if (file.language) parts.push(`Language: ${file.language}`);
  if (file.sizeBytes != null) parts.push(`Size: ${formatBytes(file.sizeBytes)}`);
  const meta = parts.join(" | ");

  switch (file.status) {
    case "ready": {
      const content = file.content ?? "";
      const lineCount = content.split("\n").length;
      const lang = file.extension?.replace(".", "") ?? "";
      return [
        meta ? `${meta} | Lines: ${lineCount}` : `Lines: ${lineCount}`,
        "",
        `\`\`\`${lang}`,
        content,
        "```",
      ].join("\n");
    }
    case "binary":
      return `${meta}\n\nBinary file — cannot display as text.`;
    case "too_large":
      return `${meta}\n\nFile is too large to read inline. Use search_codebase to locate specific symbols.`;
    case "unsupported":
      return `${meta}\n\nUnsupported file type.${file.reason ? ` Reason: ${file.reason}` : ""}`;
    case "unavailable":
      return `${meta}\n\nContent unavailable.${file.reason ? ` Reason: ${file.reason}` : ""} Re-import may be needed.`;
    default:
      return `${meta}\n\nUnknown status: ${file.status}`;
  }
}

function buildOutlineSection(parse: FileParseResponse): string {
  const { file, imports, importedBy, exports, symbols, cycles } = parse;
  const lines: string[] = [];

  // meta
  const meta: string[] = [];
  if (file.language) meta.push(`Language: ${file.language}`);
  if (file.lineCount != null) meta.push(`Lines: ${file.lineCount}`);
  if (file.sizeBytes != null) meta.push(`Size: ${formatBytes(file.sizeBytes)}`);
  meta.push(`Parse: ${file.parseStatus}`);
  lines.push(meta.join(" | "));

  // imports
  if (imports.length > 0) {
    lines.push("");
    lines.push(`### Imports (${imports.length})`);
    for (const imp of imports) {
      const target = imp.targetPathText ?? imp.moduleSpecifier;
      const typeOnly = imp.importKind === "type" ? " *(type)*" : "";
      const unresolved = imp.isResolved ? "" : " *(unresolved)*";
      lines.push(`- \`${imp.moduleSpecifier}\` → \`${target}\`${typeOnly}${unresolved}`);
    }
  }

  // imported by
  if (importedBy.length > 0) {
    lines.push("");
    lines.push(`### Imported By (${importedBy.length})`);
    for (const dep of importedBy) {
      const typeOnly = dep.importKind === "type" ? " *(type)*" : "";
      lines.push(`- \`${dep.sourceFilePath}\`${typeOnly}`);
    }
  }

  // exports
  if (exports.length > 0) {
    lines.push("");
    lines.push(`### Exports (${exports.length})`);
    for (const exp of exports) {
      const name = exp.symbolDisplayName ?? exp.exportName;
      lines.push(`- \`${name}\` (${exp.exportKind}) · line ${exp.startLine}`);
    }
  }

  // cycles
  if (cycles.length > 0) {
    lines.push("");
    lines.push(`### Cycles (${cycles.length}) ⚠️`);
    for (const cycle of cycles) {
      lines.push(`- [${cycle.kind}] ${cycle.summary}`);
      lines.push(`  Edges: ${cycle.edgeCount} · Files: ${cycle.paths.join(" ↔ ")}`);
    }
  }

  // symbols
  if (symbols.length > 0) {
    const topLevel = symbols.filter((s) => s.parentSymbolName === null);
    const childrenOf = new Map<string, ParseSymbol[]>();
    for (const s of symbols) {
      if (s.parentSymbolName) {
        const arr = childrenOf.get(s.parentSymbolName) ?? [];
        arr.push(s);
        childrenOf.set(s.parentSymbolName, arr);
      }
    }

    lines.push("");
    lines.push(`### Symbols (${symbols.length})`);
    for (const sym of topLevel) {
      const loc = sym.startLine != null ? ` · line ${sym.startLine}` : "";
      const exp = sym.isExported ? " · exported" : "";
      lines.push(`#### ${sym.displayName} · ${sym.kind}${exp}${loc}`);
      if (sym.signature) {
        lines.push("```");
        lines.push(sym.signature);
        lines.push("```");
      }
      for (const child of childrenOf.get(sym.displayName) ?? []) {
        const childLoc = child.startLine != null ? ` · line ${child.startLine}` : "";
        const childExp = child.isExported ? " · exported" : "";
        const sig = child.signature ? ` — \`${child.signature}\`` : "";
        lines.push(`- **${child.displayName}** · ${child.kind}${childExp}${childLoc}${sig}`);
      }
    }
  }

  return lines.join("\n");
}

function buildBlastRadiusSection(br: BlastRadius, maxFiles: number): string {
  const lines: string[] = [
    `Direct dependents:   ${br.directCount}`,
    `Total affected:      ${br.totalCount}`,
    `Max depth:           ${br.maxDepth}`,
    `Cycles involved:     ${br.hasCycles ? "Yes ⚠️" : "No"}`,
  ];

  if (br.files.length > 0) {
    const limit = Math.min(maxFiles, br.files.length);
    const sorted = [...br.files].sort((a, b) =>
      a.depth !== b.depth ? a.depth - b.depth : a.path.localeCompare(b.path),
    );
    lines.push("");
    lines.push(`Affected files (${limit} of ${br.files.length}):`);
    for (const f of sorted.slice(0, limit)) {
      const lang = f.language ? ` [${f.language}]` : "";
      lines.push(
        `  depth ${f.depth}  ${f.path}${lang}  (in: ${f.incomingCount}, out: ${f.outgoingCount})`,
      );
    }
    if (br.files.length > limit) {
      lines.push(`  … and ${br.files.length - limit} more`);
    }
  } else {
    lines.push("No other files depend on this file.");
  }

  return lines.join("\n");
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerGetFileTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_file",
    {
      title: "Get File",
      description:
        "Returns detailed information about a file in the CodeMap project. " +
        "Default includes source code (content) and a full outline: imports, " +
        "imported-by, exports, and symbols with signatures and line numbers. " +
        "Add blast_radius to also see impact analysis (which files would be " +
        "affected if this file changed). Content and parse data are fetched in " +
        "parallel. project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Repository-relative file path, e.g. 'src/lib/utils.ts'."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
        include: z
          .array(z.enum(["content", "outline", "blast_radius"]))
          .optional()
          .default(["content", "outline"])
          .describe(
            "Sections to include. Default: [content, outline]. " +
              "outline covers imports, imported-by, exports, and symbols. " +
              "Add blast_radius for impact analysis.",
          ),
        blast_radius_max_files: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe(
            "Max affected files to list when blast_radius is included (default 20).",
          ),
      },
    },
    withToolError(
      async ({ path: filePath, project_id, include, blast_radius_max_files }) => {
        const resolvedProjectId =
          project_id ?? (await readWorkspaceProjectId());

        if (!resolvedProjectId) {
          return text(
            "No project ID provided and no linked project found for this workspace.\n" +
              "Run create_project first to link this workspace to a CodeMap project.",
          );
        }

        // ── Auto-sync: push local file to BE if it's newer than what BE has ──
        const workspacePath = await readWorkspacePath();
        const localAbsolutePath = `${workspacePath}/${filePath}`;

        try {
          const localStat = await stat(localAbsolutePath);
          const localMtime = localStat.mtime;
          const localContent = await readFile(localAbsolutePath, "utf8");

          await client.request<FileSyncResult>(
            `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/sync`,
            {
              authRequired: true,
              method: "POST",
              body: {
                path: filePath,
                content: localContent,
                localUpdatedAt: localMtime.toISOString(),
              },
            },
          );
        } catch {
          // Sync is best-effort — if file doesn't exist locally or BE rejects,
          // just proceed with whatever data BE has.
        }

        const sections = include ?? ["content", "outline"];
        const wantContent = sections.includes("content");
        // outline and blast_radius both come from /files/parse — one call covers both
        const wantParse =
          sections.includes("outline") || sections.includes("blast_radius");
        const wantBlastRadius = sections.includes("blast_radius");

        const [contentResult, parseResult] = await Promise.allSettled([
          wantContent
            ? client.request<FileContent>(
                `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/content`,
                { authRequired: true, query: { path: filePath } },
              )
            : Promise.resolve(null),

          wantParse
            ? client.request<FileParseResponse>(
                `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/parse`,
                { authRequired: true, query: { path: filePath } },
              )
            : Promise.resolve(null),
        ]);

        // If both failed, surface the error
        const requestedResults = [
          wantContent ? contentResult : null,
          wantParse ? parseResult : null,
        ].filter(Boolean) as PromiseSettledResult<unknown>[];

        if (requestedResults.every((r) => r.status === "rejected")) {
          const err =
            contentResult.status === "rejected"
              ? contentResult.reason
              : parseResult.status === "rejected"
                ? parseResult.reason
                : null;
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("404")) {
            return text(
              `File not found: ${filePath}\n` +
                "Check that the path is correct and relative to the repository root.",
            );
          }
          throw err;
        }

        const output: string[] = [`# ${filePath}`, ""];

        // Content
        if (wantContent) {
          output.push("## Content");
          if (
            contentResult.status === "fulfilled" &&
            contentResult.value
          ) {
            output.push(buildContentSection(contentResult.value as FileContent));
          } else if (contentResult.status === "rejected") {
            output.push(
              `Failed to load: ${(contentResult.reason as Error).message}`,
            );
          }
          output.push("");
        }

        // Outline (imports + importedBy + exports + symbols)
        if (sections.includes("outline")) {
          output.push("## Outline");
          if (
            parseResult.status === "fulfilled" &&
            parseResult.value
          ) {
            output.push(
              buildOutlineSection(parseResult.value as FileParseResponse),
            );
          } else if (parseResult.status === "rejected") {
            output.push(
              `Failed to load: ${(parseResult.reason as Error).message}`,
            );
          }
          output.push("");
        }

        // Blast radius (from the same parse response)
        if (wantBlastRadius) {
          output.push("## Blast Radius");
          if (
            parseResult.status === "fulfilled" &&
            parseResult.value
          ) {
            const br = (parseResult.value as FileParseResponse).blastRadius;
            output.push(
              buildBlastRadiusSection(br, blast_radius_max_files),
            );
          } else if (parseResult.status === "rejected") {
            output.push(
              `Failed to load: ${(parseResult.reason as Error).message}`,
            );
          }
          output.push("");
        }

        return text(output.join("\n").trimEnd());
      },
    ),
  );
}
