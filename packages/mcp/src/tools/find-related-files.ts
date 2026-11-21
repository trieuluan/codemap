import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureLocalIndexWithSummary } from "@codemap-ai/core/lib/local-index.js";
import { success, withToolError } from "@codemap-ai/core/lib/tool-response.js";

interface RelatedCandidate {
  path: string;
  score: number;
  reasons: string[];
}

export function registerFindRelatedFilesTool(server: McpServer) {
  server.registerTool(
    "find_related_files",
    {
      title: "Find Related Files",
      description:
        "Find files related to a target file, symbol, or query using local import/importer graph and path proximity.",
      inputSchema: {
        file_path: z
          .string()
          .optional()
          .describe("Anchor file path relative to workspace root."),
        symbol_name: z
          .string()
          .optional()
          .describe("Symbol name to locate the anchor file."),
        query: z
          .string()
          .optional()
          .describe("Keyword query if file_path and symbol_name are omitted."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(15)
          .describe("Max related files to return (default: 15)."),
      },
    },
    withToolError(async ({ file_path, symbol_name, query, limit }) => {
      const { store } = await ensureLocalIndexWithSummary();
      const anchors: string[] = [];

      if (file_path) {
        anchors.push(file_path.replace(/^\/+/, ""));
      } else if (symbol_name) {
        const res = store.search(symbol_name, null);
        for (const s of res.symbols.slice(0, 3)) {
          if (!anchors.includes(s.filePath)) anchors.push(s.filePath);
        }
      } else if (query) {
        const res = store.search(query, null);
        for (const f of res.files.slice(0, 3)) {
          if (!anchors.includes(f.path)) anchors.push(f.path);
        }
        for (const s of res.symbols.slice(0, 3)) {
          if (!anchors.includes(s.filePath)) anchors.push(s.filePath);
        }
      }

      if (anchors.length === 0) {
        return success("No anchor file resolved. Provide file_path, symbol_name, or query.", {
          anchors: [],
          relatedFiles: [],
        });
      }

      const candidates = new Map<string, RelatedCandidate>();
      const addCandidate = (p: string, score: number, reason: string) => {
        if (anchors.includes(p)) return;
        const prev = candidates.get(p);
        if (prev) {
          prev.score += score;
          if (!prev.reasons.includes(reason)) prev.reasons.push(reason);
        } else {
          candidates.set(p, { path: p, score, reasons: [reason] });
        }
      };

      const allPaths = store.getAllFilePaths();
      for (const anchor of anchors) {
        const parsed = store.getFileParse(anchor);
        if (parsed) {
          for (const imp of parsed.imports) {
            if (imp.targetPathText) {
              addCandidate(imp.targetPathText, 5, `imported by ${anchor}`);
            }
          }
          for (const ib of parsed.importedBy) {
            addCandidate(ib.sourceFilePath, 6, `imports ${anchor}`);
          }
        }

        const anchorDir = path.posix.dirname(anchor);
        const anchorStem = path.posix.basename(anchor).replace(/\.[^.]+$/, "");
        for (const candidate of allPaths) {
          if (path.posix.dirname(candidate) === anchorDir) {
            addCandidate(candidate, 2, "same directory");
          }
          const candStem = path.posix.basename(candidate).replace(/\.(test|spec)\.[^.]+$/, "").replace(/\.[^.]+$/, "");
          if (candStem === anchorStem && candidate !== anchor) {
            addCandidate(candidate, 4, "matching stem / test pair");
          }
        }
      }

      const ranked = [...candidates.values()]
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, limit);

      const text = ranked.length > 0
        ? [
            `Anchors: ${anchors.join(", ")}`,
            `Related files (${ranked.length}):`,
            ...ranked.map((r, idx) => `${idx + 1}. ${r.path} (score=${r.score}; ${r.reasons.join(", ")})`),
          ].join("\n")
        : `No related files found for ${anchors.join(", ")}.`;

      return success(text, { anchors, relatedFiles: ranked });
    }),
  );
}
