import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";

import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId } from "../lib/workspace-project.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import type {
  CodebaseSearchResponse,
} from "../lib/api-types.js";

export function registerFindRelatedFilesTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "find_related_files",
    {
      title: "Find Related Files",
      description:
        "Find files related to a given file or symbol. " +
        "Analyzes import relationships, shared dependencies, and code similarity " +
        "to suggest relevant files for context. " +
        "Useful when you need to understand the broader context around a file you're editing. " +
        "project_id is optional if workspace is linked.",
      inputSchema: {
        file_path: z
          .string()
          .optional()
          .describe(
            "Path to the file to find related files for. " +
              "Either file_path or symbol_name must be provided.",
          ),
        symbol_name: z
          .string()
          .optional()
          .describe(
            "Name of the symbol to find related files for. " +
              "Either file_path or symbol_name must be provided.",
          ),
        max_results: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of related files to return. Default: 10."),
        include_imports: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include files that this file imports. Default: true."),
        include_imported_by: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include files that import this file. Default: true."),
        include_shared_dependencies: z
          .boolean()
          .optional()
          .default(true)
          .describe("Include files that share common dependencies. Default: true."),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe("CodeMap project UUID. Auto-resolved from workspace if omitted."),
      },
    },
    withToolError(async ({ file_path, symbol_name, max_results, include_imports, include_imported_by, include_shared_dependencies, project_id }) => {
      const client = createCodeMapClient(config);
      const resolvedProjectId = project_id ?? (await readWorkspaceProjectId());

      if (!resolvedProjectId) {
        return success(
          "No project ID provided and no linked project found for this workspace.\n" +
            "Run create_project first to link this workspace to a CodeMap project.",
          {
            projectId: null,
            file_path,
            symbol_name,
            relatedFiles: [],
          },
        );
      }

      // If symbol_name is provided, first find the file containing that symbol
      let filePathToQuery = file_path;

      if (symbol_name && !filePathToQuery) {
        const searchResult = await client.request<CodebaseSearchResponse>(
          `/projects/${encodeURIComponent(resolvedProjectId)}/map/search`,
          {
            authRequired: true,
            query: { q: symbol_name, kinds: "symbols" },
          },
        );

        if (searchResult.symbols.length === 0) {
          return success(
            `Symbol '${symbol_name}' not found in the codebase.`,
            {
              projectId: resolvedProjectId,
              file_path,
              symbol_name,
              relatedFiles: [],
              reason: "symbol_not_found",
            },
          );
        }

        // Use the first matching symbol's file
        filePathToQuery = searchResult.symbols[0].filePath;
      }

      if (!filePathToQuery) {
        return success(
          "Either file_path or symbol_name must be provided to find related files.",
          {
            projectId: resolvedProjectId,
            file_path,
            symbol_name,
            relatedFiles: [],
            reason: "missing_input",
          },
        );
      }

      // Get the file details to find its relationships
      const fileData = await client.request<{
        file: {
          id: string;
          path: string;
          language: string | null;
          imports: Array<{
            targetPath: string | null;
            targetFileId: string | null;
            importKind: string;
          }>;
          importedBy: Array<{
            sourcePath: string;
            sourceFileId: string;
            importKind: string;
          }>;
        };
      }>(
        `/projects/${encodeURIComponent(resolvedProjectId)}/map/files`,
        {
          authRequired: true,
          query: { path: filePathToQuery },
        },
      );

      const relatedFiles: Array<{
        path: string;
        reason: string;
        relationship: "imports" | "imported_by" | "shared_dependency";
        score: number;
      }> = [];

      // Collect files that this file imports
      if (include_imports && fileData.file.imports) {
        for (const imp of fileData.file.imports) {
          if (imp.targetPath) {
            relatedFiles.push({
              path: imp.targetPath,
              reason: "this file imports it",
              relationship: "imports",
              score: 0.9,
            });
          }
        }
      }

      // Collect files that import this file
      if (include_imported_by && fileData.file.importedBy) {
        for (const importer of fileData.file.importedBy) {
          relatedFiles.push({
            path: importer.sourcePath,
            reason: "imports this file",
            relationship: "imported_by",
            score: 0.9,
          });
        }
      }

      // Deduplicate and sort by score
      const uniqueFiles = new Map<string, typeof relatedFiles[0]>();
      for (const file of relatedFiles) {
        const existing = uniqueFiles.get(file.path);
        if (!existing || file.score > existing.score) {
          uniqueFiles.set(file.path, file);
        }
      }

      const results = Array.from(uniqueFiles.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, max_results);

      const summary = buildSummary(filePathToQuery, results);

      return success(summary, {
        projectId: resolvedProjectId,
        queryFile: filePathToQuery,
        querySymbol: symbol_name,
        relatedFiles: results,
        total: results.length,
      });
    }),
  );
}

function buildSummary(queryFile: string, relatedFiles: Array<{ path: string; reason: string }>): string {
  const lines: string[] = [];

  lines.push(`## Related Files for \`${queryFile}\``);
  lines.push("");
  lines.push(`Found ${relatedFiles.length} related file(s):`);
  lines.push("");

  for (let i = 0; i < relatedFiles.length; i++) {
    const file = relatedFiles[i];
    lines.push(`${i + 1}. **${file.path}**`);
    lines.push(`   Reason: ${file.reason}`);
    lines.push(`   → get_file(path, include=["outline"])`);
    lines.push("");
  }

  return lines.join("\n");
}
