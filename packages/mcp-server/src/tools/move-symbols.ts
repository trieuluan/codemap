import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import { success, withToolError } from "../lib/tool-response.js";
import { readWorkspaceProjectId, readWorkspacePath } from "../lib/workspace-project.js";
import { escapeRegex } from "../lib/regex-utils.js";

// ─── types (subset of get-file parse response) ───────────────────────────────

interface ParseSymbol {
  id: string;
  displayName: string;
  kind: string;
  startLine: number | null;
  endLine: number | null;
}

interface ParseImportedBy {
  sourceFilePath: string;
  moduleSpecifier: string;
  importKind: string;
}

interface FileParseResponse {
  file: { language: string | null };
  symbols: ParseSymbol[];
  importedBy: ParseImportedBy[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

interface SymbolRange {
  name: string;
  id: string;
  startLine: number;
  endLine: number;
  body: string;
}

function extractSymbolRanges(
  symbols: ParseSymbol[],
  symbolNames: string[],
  fullContent: string,
): { ranges: SymbolRange[]; notFound: string[] } {
  const lines = fullContent.split("\n");
  const totalLines = lines.length;

  const sorted = [...symbols]
    .filter((s) => s.startLine != null)
    .sort((a, b) => (a.startLine ?? 0) - (b.startLine ?? 0));

  const ranges: SymbolRange[] = [];
  const notFound: string[] = [];

  for (const name of symbolNames) {
    const sym = symbols.find(
      (s) => s.displayName.toLowerCase() === name.toLowerCase(),
    );

    if (!sym || sym.startLine == null) {
      notFound.push(name);
      continue;
    }

    const idx = sorted.findIndex((s) => s.id === sym.id);
    const next = sorted[idx + 1];
    const endLine = next?.startLine != null ? next.startLine - 1 : totalLines;

    ranges.push({
      name: sym.displayName,
      id: sym.id,
      startLine: sym.startLine,
      endLine,
      body: lines.slice(sym.startLine - 1, endLine).join("\n"),
    });
  }

  return { ranges, notFound };
}

function removeSymbolsFromSource(content: string, ranges: SymbolRange[]): string {
  const lines = content.split("\n");

  // Remove from bottom to top to preserve line numbers
  const sorted = [...ranges].sort((a, b) => b.startLine - a.startLine);
  for (const range of sorted) {
    lines.splice(range.startLine - 1, range.endLine - range.startLine + 1);
  }

  // Collapse 3+ consecutive blank lines into 2
  const cleaned: string[] = [];
  let blankCount = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      blankCount++;
      if (blankCount <= 2) cleaned.push(line);
    } else {
      blankCount = 0;
      cleaned.push(line);
    }
  }

  return cleaned.join("\n");
}

function computeRelativeImportPath(
  callerAbsPath: string,
  toRelPath: string,
  workspacePath: string,
): string {
  const toAbsPath = path.join(workspacePath, toRelPath);
  const callerDir = path.dirname(callerAbsPath);
  let rel = path.relative(callerDir, toAbsPath);
  // Strip TS/JS extension (convention)
  rel = rel.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
  // Normalize separators to posix
  rel = rel.split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

interface RewriteResult {
  kept: string | null;
  added: string | null;
}

function rewriteImportLine(
  line: string,
  movedSymbols: string[],
  newImportPath: string,
  oldSpecifierPattern: RegExp,
): RewriteResult | null {
  if (!oldSpecifierPattern.test(line)) return null;

  const movedSet = new Set(movedSymbols.map((s) => s.toLowerCase()));

  // Named imports: { Foo, Bar, type Baz }
  const namedMatch = line.match(/\{([^}]+)\}/);
  if (namedMatch) {
    const allNames = namedMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const keptNames = allNames.filter(
      (n) => !movedSet.has(n.replace(/^type\s+/, "").toLowerCase()),
    );
    const movedNames = allNames.filter((n) =>
      movedSet.has(n.replace(/^type\s+/, "").toLowerCase()),
    );

    const quote = line.includes('"') ? '"' : "'";
    const kept =
      keptNames.length > 0
        ? line.replace(/\{[^}]+\}/, `{ ${keptNames.join(", ")} }`)
        : null;
    const isTypeImport = line.match(/^import\s+type\s+/);
    const added =
      movedNames.length > 0
        ? `import ${isTypeImport ? "type " : ""}{ ${movedNames.join(", ")} } from ${quote}${newImportPath}${quote};`
        : null;

    return { kept, added };
  }

  // Default import: import Foo from '...'
  const defaultMatch = line.match(/^import\s+(\w+)\s+from/);
  if (defaultMatch) {
    const importedName = defaultMatch[1];
    if (movedSet.has(importedName.toLowerCase())) {
      const newLine = line.replace(oldSpecifierPattern, (m) =>
        m.replace(/['"][^'"]+['"]/, (q) => {
          const qt = q[0];
          return `${qt}${newImportPath}${qt}`;
        }),
      );
      return { kept: null, added: newLine };
    }
  }

  return null;
}

// ─── tool ────────────────────────────────────────────────────────────────────

export function registerMoveSymbolsTool(
  server: McpServer,
  config: McpServerConfig,
) {
  const client = createCodeMapClient(config);

  server.registerTool(
    "move_symbols",
    {
      title: "Move Symbols",
      description:
        "Move functions, classes, or other symbols from one file to another, " +
        "and optionally update all import statements across the codebase. " +
        "The destination file must already exist. " +
        "After moving, the CodeMap index will be updated automatically on the next get_file call. " +
        "project_id is optional if this workspace was linked via create_project.",
      inputSchema: {
        from: z
          .string()
          .min(1)
          .describe(
            "Repository-relative path of the source file, e.g. 'src/lib/utils.ts'.",
          ),
        to: z
          .string()
          .min(1)
          .describe(
            "Repository-relative path of the destination file. Must already exist.",
          ),
        symbols: z
          .array(z.string().min(1))
          .min(1)
          .describe(
            "Symbol names to move. Case-insensitive. E.g. ['parseDartFile', 'DartAstNode'].",
          ),
        project_id: z
          .string()
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
        update_imports: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Whether to update import statements in all caller files. Default true.",
          ),
      },
    },
    withToolError(
      async ({ from, to, symbols, project_id, update_imports }) => {
        const resolvedProjectId =
          project_id ?? (await readWorkspaceProjectId());
        const workspacePath = await readWorkspacePath();

        if (!workspacePath) {
          return success("No workspace path found. Is this workspace linked to a CodeMap project?", {
            from, to, symbolsMoved: [], symbolsSkipped: [], symbolsNotFound: symbols,
            filesUpdated: [], filesSkipped: [], warnings: ["no_workspace_path"],
          });
        }

        const fromAbsPath = path.join(workspacePath, from);
        const toAbsPath = path.join(workspacePath, to);

        // Validate files exist
        try {
          await access(fromAbsPath);
        } catch {
          throw new Error(`Source file not found: ${from}`);
        }
        try {
          await access(toAbsPath);
        } catch {
          throw new Error(`Destination file does not exist: ${to}. Create it first.`);
        }

        if (fromAbsPath === toAbsPath) {
          throw new Error("Source and destination are the same file.");
        }

        const warnings: string[] = [];
        const symbolsMoved: string[] = [];
        const symbolsSkipped: string[] = [];
        const filesUpdated: string[] = [];
        const filesSkipped: string[] = [];

        // Fetch parse data + content from source file in parallel
        const [parseResult, contentResult, destParseResult] = await Promise.allSettled([
          resolvedProjectId
            ? client.request<FileParseResponse>(
                `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/parse`,
                { authRequired: true, query: { path: from } },
              )
            : Promise.resolve(null),
          readFile(fromAbsPath, "utf8"),
          resolvedProjectId
            ? client.request<FileParseResponse>(
                `/projects/${encodeURIComponent(resolvedProjectId)}/map/files/parse`,
                { authRequired: true, query: { path: to } },
              ).catch(() => null)
            : Promise.resolve(null),
        ]);

        const srcContent =
          contentResult.status === "fulfilled" ? contentResult.value : null;

        if (!srcContent) {
          throw new Error(`Could not read source file: ${from}`);
        }

        const parse =
          parseResult.status === "fulfilled" ? parseResult.value : null;
        const destParse =
          destParseResult.status === "fulfilled" ? destParseResult.value : null;

        // Check for conflicts in destination
        const destSymbolNames = new Set(
          (destParse?.symbols ?? []).map((s) => s.displayName.toLowerCase()),
        );

        const symbolsToMove = symbols.filter((name) => {
          if (destSymbolNames.has(name.toLowerCase())) {
            symbolsSkipped.push(name);
            warnings.push(
              `Symbol '${name}' already exists in ${to} — skipped to avoid conflict`,
            );
            return false;
          }
          return true;
        });

        if (symbolsToMove.length === 0) {
          const summary = `No symbols moved — all skipped due to conflicts.\n\nWarnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}`;
          return success(summary, {
            from, to, symbolsMoved: [], symbolsSkipped, symbolsNotFound: [],
            filesUpdated: [], filesSkipped: [], warnings,
          });
        }

        // Extract symbol ranges
        const { ranges, notFound } = parse
          ? extractSymbolRanges(parse.symbols, symbolsToMove, srcContent)
          : { ranges: [], notFound: symbolsToMove };

        if (notFound.length > 0) {
          warnings.push(
            `Symbols not found in ${from} (not indexed or wrong name): ${notFound.join(", ")}`,
          );
        }

        if (ranges.length === 0) {
          const summary = `No symbols could be extracted from ${from}.\n\nWarnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}`;
          return success(summary, {
            from, to, symbolsMoved: [], symbolsSkipped, symbolsNotFound: notFound,
            filesUpdated: [], filesSkipped: [], warnings,
          });
        }

        // Check if symbol body references other symbols in source that aren't being moved
        if (parse) {
          const movedNameSet = new Set(ranges.map((r) => r.name.toLowerCase()));
          const sourceSymbolNames = parse.symbols
            .map((s) => s.displayName)
            .filter((n) => !movedNameSet.has(n.toLowerCase()));

          for (const range of ranges) {
            for (const srcSym of sourceSymbolNames) {
              // Simple word-boundary check in body
              const re = new RegExp(`\\b${escapeRegex(srcSym)}\\b`);
              if (re.test(range.body)) {
                warnings.push(
                  `Symbol '${range.name}' references '${srcSym}' which remains in ${from} — manual import may be needed in ${to}`,
                );
              }
            }
          }
        }

        // Append symbol bodies to destination file
        const destContent = await readFile(toAbsPath, "utf8");
        const appendParts = ranges.map((r) => r.body).join("\n\n");
        const separator = destContent.trimEnd().length > 0 ? "\n\n" : "";
        await writeFile(toAbsPath, destContent.trimEnd() + separator + appendParts + "\n", "utf8");

        for (const range of ranges) symbolsMoved.push(range.name);

        // Remove symbols from source file
        const newSrcContent = removeSymbolsFromSource(srcContent, ranges);
        await writeFile(fromAbsPath, newSrcContent, "utf8");

        // Update imports in callers
        if (update_imports && resolvedProjectId) {
          const callers = parse?.importedBy ?? [];

          for (const caller of callers) {
            const callerAbsPath = path.join(workspacePath, caller.sourceFilePath);

            // Build regex to match this module specifier in import lines
            const escapedSpec = escapeRegex(caller.moduleSpecifier);
            const fromBasename = path.basename(from).replace(/\.(ts|tsx|js|jsx)$/, "");
            const escapedBasename = escapeRegex("./" + fromBasename);
            const specPattern = new RegExp(
              `['"](?:${escapedSpec}|${escapedBasename})['"]`,
            );

            let callerContent: string;
            try {
              callerContent = await readFile(callerAbsPath, "utf8");
            } catch {
              filesSkipped.push(caller.sourceFilePath);
              warnings.push(`Could not read ${caller.sourceFilePath} — skipped`);
              continue;
            }

            const newImportPath = computeRelativeImportPath(callerAbsPath, to, workspacePath);
            const callerLines = callerContent.split("\n");
            let modified = false;

            const newLines: string[] = [];
            for (const line of callerLines) {
              const result = rewriteImportLine(line, symbolsMoved, newImportPath, specPattern);
              if (result === null) {
                newLines.push(line);
              } else {
                modified = true;
                if (result.kept) newLines.push(result.kept);
                if (result.added) newLines.push(result.added);
              }
            }

            if (modified) {
              await writeFile(callerAbsPath, newLines.join("\n"), "utf8");
              filesUpdated.push(caller.sourceFilePath);
            } else {
              // Couldn't match import line — possibly alias or barrel export
              filesSkipped.push(caller.sourceFilePath);
              warnings.push(
                `Could not reliably update imports in ${caller.sourceFilePath} — please update manually`,
              );
            }
          }
        }

        // Build summary
        const lines: string[] = [
          `Moved ${symbolsMoved.length} symbol(s) from ${from} → ${to}`,
          ...symbolsMoved.map((s) => `  - ${s}`),
        ];

        if (symbolsSkipped.length > 0) {
          lines.push(`\nSkipped ${symbolsSkipped.length} symbol(s) (conflicts):`);
          lines.push(...symbolsSkipped.map((s) => `  - ${s}`));
        }

        if (notFound.length > 0) {
          lines.push(`\nNot found ${notFound.length} symbol(s):`);
          lines.push(...notFound.map((s) => `  - ${s}`));
        }

        if (filesUpdated.length > 0) {
          lines.push(`\nUpdated imports in ${filesUpdated.length} file(s):`);
          lines.push(...filesUpdated.map((f) => `  - ${f}`));
        }

        if (filesSkipped.length > 0) {
          lines.push(`\nCould not auto-update ${filesSkipped.length} file(s) — update manually:`);
          lines.push(...filesSkipped.map((f) => `  - ${f}`));
        }

        if (warnings.length > 0) {
          lines.push(`\nWarnings (${warnings.length}):`);
          lines.push(...warnings.map((w) => `  - ${w}`));
        }

        return success(lines.join("\n"), {
          from,
          to,
          symbolsMoved,
          symbolsSkipped,
          symbolsNotFound: notFound,
          filesUpdated,
          filesSkipped,
          warnings,
          updateImports: update_imports,
        });
      },
    ),
  );
}
