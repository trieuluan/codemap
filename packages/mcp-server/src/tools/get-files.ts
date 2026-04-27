import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";

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
  startLine: number;
}

interface ParseImportedBy {
  sourceFilePath: string;
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
  returnType: string | null;
  heritage: Array<{ kind: string; targetName: string }>;
  isExported: boolean;
  parentSymbolName: string | null;
  startLine: number | null;
  endLine: number | null;
}

interface FileParseResponse {
  file: ParseFileInfo;
  imports: ParseImport[];
  importedBy: ParseImportedBy[];
  exports: ParseExport[];
  symbols: ParseSymbol[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildOutlineSection(parse: FileParseResponse): string {
  const { file, imports, importedBy, exports, symbols } = parse;
  const lines: string[] = [];

  const meta: string[] = [];
  if (file.language) meta.push(`Language: ${file.language}`);
  if (file.lineCount != null) meta.push(`Lines: ${file.lineCount}`);
  if (file.sizeBytes != null) meta.push(`Size: ${formatBytes(file.sizeBytes)}`);
  meta.push(`Parse: ${file.parseStatus}`);
  lines.push(meta.join(" | "));

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

  if (importedBy.length > 0) {
    lines.push("");
    lines.push(`### Imported By (${importedBy.length})`);
    for (const dep of importedBy) {
      const typeOnly = dep.importKind === "type" ? " *(type)*" : "";
      lines.push(`- \`${dep.sourceFilePath}\`${typeOnly}`);
    }
  }

  if (exports.length > 0) {
    lines.push("");
    lines.push(`### Exports (${exports.length})`);
    for (const exp of exports) {
      const name = exp.symbolDisplayName ?? exp.exportName;
      lines.push(`- \`${name}\` (${exp.exportKind}) · line ${exp.startLine}`);
    }
  }

  if (symbols.length > 0) {
    const topLevel = symbols.filter((s) => s.parentSymbolName === null);
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
      if (sym.returnType) lines.push(`Returns: \`${sym.returnType}\``);
      for (const h of sym.heritage) {
        lines.push(`${h.kind === "implements" ? "Implements" : "Extends"}: \`${h.targetName}\``);
      }
    }
  }

  return lines.join("\n");
}

export function registerGetFilesTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "get_files",
    {
      title: "Get Files (Batch Outline)",
      description:
        "Fetches outline for multiple files in a single call — imports, exported-by, exports, and symbols with signatures. " +
        "Use this after suggest_edit_locations when you need to survey several files before deciding where to edit. " +
        "Runs all requests in parallel. Maximum 7 files per call. " +
        "Does not support full content — use get_file for that. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        paths: z
          .array(z.string().min(1))
          .min(1)
          .max(7)
          .describe("Repository-relative file paths to fetch outlines for. Maximum 7."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ paths, project_id }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success(
          "No project ID provided and no linked project found for this workspace.\n" +
            "Run create_project first to link this workspace to a CodeMap project.",
          { projectId: null, paths, results: [], available: false },
        );
      }

      const results = await Promise.allSettled(
        paths.map((filePath) =>
          client.request<FileParseResponse>(
            `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/parse`,
            { authRequired: true, query: { path: filePath } },
          ),
        ),
      );

      const output: string[] = [`# Batch Outline (${paths.length} files)`, ""];
      const structured: Array<{ path: string; status: "ok" | "error"; error?: string }> = [];

      for (let i = 0; i < paths.length; i++) {
        const filePath = paths[i];
        const result = results[i];
        output.push(`## ${filePath}`);
        output.push("");

        if (result.status === "fulfilled" && result.value) {
          output.push(buildOutlineSection(result.value));
          structured.push({ path: filePath, status: "ok" });
        } else {
          const msg =
            result.status === "rejected"
              ? result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
              : "No data returned";
          output.push(`_Failed to load: ${msg}_`);
          structured.push({ path: filePath, status: "error", error: msg });
        }

        output.push("");
      }

      return success(output.join("\n").trimEnd(), {
        projectId: resolvedProjectId,
        paths,
        results: structured,
        available: true,
      });
    }),
  );
}
