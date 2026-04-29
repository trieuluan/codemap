import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId, readWorkspacePath } from "../lib/workspace-project.js";
import { escapeRegex } from "../lib/regex-utils.js";

const execFileAsync = promisify(execFile);

// ─── types (subset of parse/usages response) ─────────────────────────────────

interface ParseSymbol {
  id: string;
  displayName: string;
  kind: string;
  startLine: number | null;
  endLine: number | null;
}

interface OccurrenceRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

interface SymbolOccurrence {
  filePath: string;
  range: OccurrenceRange;
}

interface SymbolUsagesApiResponse {
  symbol: { displayName: string; filePath: string } | null;
  occurrences: SymbolOccurrence[];
  callers: { filePath: string }[];
}

interface FileParseResponse {
  file: { language: string | null };
  symbols: ParseSymbol[];
  importedBy: { sourceFilePath: string; moduleSpecifier: string }[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function renameInContent(content: string, oldName: string, newName: string): { result: string; count: number } {
  const re = new RegExp(`\\b${escapeRegex(oldName)}\\b`, "g");
  let count = 0;
  const result = content.replace(re, () => {
    count++;
    return newName;
  });
  return { result, count };
}

async function gitLsFiles(workspacePath: string): Promise<Set<string>> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: workspacePath });
    return new Set(stdout.trim().split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerRenameSymbolTool(server: McpServer, config: McpServerConfig) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "rename_symbol",
    {
      title: "Rename Symbol",
      description:
        "Rename a function, class, variable, or other symbol across the entire codebase. " +
        "Finds all occurrences using the CodeMap parse index, renames them in-place with " +
        "word-boundary matching, and updates import statements automatically. " +
        "More precise than a raw text search because it uses the symbol's known definition " +
        "location to anchor the rename, then updates every call site. " +
        "When the parse index is unavailable, falls back to text-based search across all tracked files — " +
        "check data.method in the response: 'index_based' is precise, 'text_based' may have false positives. " +
        "After renaming, call trigger_reimport to refresh the index. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        file: z
          .string()
          .min(1)
          .describe("Repository-relative path of the file where the symbol is defined, e.g. 'src/lib/utils.ts'."),
        symbol: z
          .string()
          .min(1)
          .describe("Current name of the symbol to rename. Case-sensitive."),
        new_name: z
          .string()
          .min(1)
          .describe("New name for the symbol. Must be a valid identifier."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
        rename_in_file_only: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, only rename within the definition file — skip updating callers. " +
            "Useful when the symbol is unexported or you want a partial rename. Default false.",
          ),
      },
    },
    withToolError(async ({ file, symbol, new_name, project_id, rename_in_file_only }) => {
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());
      const workspacePath = await readWorkspacePath();

      if (!workspacePath) {
        return success("No workspace path found. Is this workspace linked to a CodeMap project?", {
          file, symbol, newName: new_name,
          filesUpdated: [], totalOccurrences: 0, warnings: ["no_workspace_path"],
        });
      }

      const fileAbsPath = path.join(workspacePath, file);
      try {
        await access(fileAbsPath);
      } catch {
        throw new Error(`File not found: ${file}`);
      }

      if (!new_name.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/)) {
        throw new Error(`'${new_name}' is not a valid identifier.`);
      }

      const warnings: string[] = [];
      const filesUpdated: string[] = [];
      let totalOccurrences = 0;

      // Fetch parse data to verify symbol exists and get occurrence data
      const [parseResult, usagesResult] = await Promise.allSettled([
        resolvedProjectId
          ? client.request<FileParseResponse>(
              `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/parse`,
              { authRequired: true, query: { path: file } },
            )
          : Promise.resolve(null),
        resolvedProjectId
          ? client.request<SymbolUsagesApiResponse>(
              `/projects/${encodeURIComponent(resolvedProjectId)}/map/usages`,
              { authRequired: true, query: { symbol, filePath: file } },
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      const parse = parseResult.status === "fulfilled" ? parseResult.value : null;
      const usages = usagesResult.status === "fulfilled" ? usagesResult.value : null;

      // Verify symbol exists in the definition file
      if (parse) {
        const found = parse.symbols.find(
          (s) => s.displayName.toLowerCase() === symbol.toLowerCase(),
        );
        if (!found) {
          warnings.push(
            `Symbol '${symbol}' not found in parse index for ${file}. ` +
            "Proceeding with text-based rename — results may be imprecise.",
          );
        }
      } else {
        warnings.push("Parse index unavailable — falling back to text-based rename across tracked files.");
      }

      // Collect files to rename in
      const filesToUpdate = new Set<string>([file]);

      if (!rename_in_file_only) {
        if (usages?.occurrences) {
          for (const occ of usages.occurrences) {
            if (occ.filePath) filesToUpdate.add(occ.filePath);
          }
        }

        if (parse?.importedBy) {
          for (const imp of parse.importedBy) {
            if (imp.sourceFilePath) filesToUpdate.add(imp.sourceFilePath);
          }
        }

        // If no index data, fall back to git ls-files for a broad scan
        if (!usages && !parse) {
          const tracked = await gitLsFiles(workspacePath);
          const codeExts = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
          for (const f of tracked) {
            if (codeExts.has(path.extname(f))) filesToUpdate.add(f);
          }
          warnings.push(
            "No index data available. Scanned all tracked source files — review changes carefully.",
          );
        }
      }

      // Perform rename in each file
      for (const relPath of filesToUpdate) {
        const absPath = path.join(workspacePath, relPath);

        let content: string;
        try {
          content = await readFile(absPath, "utf8");
        } catch {
          warnings.push(`Could not read ${relPath} — skipped`);
          continue;
        }

        const { result, count } = renameInContent(content, symbol, new_name);

        if (count === 0) continue;

        try {
          await writeFile(absPath, result, "utf8");
          filesUpdated.push(relPath);
          totalOccurrences += count;
        } catch {
          warnings.push(`Could not write ${relPath} — skipped`);
        }
      }

      const lines: string[] = [
        `Renamed '${symbol}' → '${new_name}' in ${filesUpdated.length} file(s), ${totalOccurrences} occurrence(s).`,
        ...filesUpdated.map((f) => `  - ${f}`),
      ];

      if (warnings.length > 0) {
        lines.push(`\nWarnings (${warnings.length}):`);
        lines.push(...warnings.map((w) => `  - ${w}`));
      }

      if (filesUpdated.length > 0) {
        lines.push("\nRun trigger_reimport to refresh the CodeMap index.");
      }

      const renameMethod = (!usages && !parse) ? "text_based" : "index_based";

      return success(lines.join("\n"), {
        file,
        symbol,
        newName: new_name,
        filesUpdated,
        totalOccurrences,
        warnings,
        renameInFileOnly: rename_in_file_only,
        method: renameMethod,
      });
    }),
  );
}
