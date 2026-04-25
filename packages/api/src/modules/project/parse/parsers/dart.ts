import type { WorkspaceFileCandidate } from "../file-discovery";
import { buildImportLocalKey, buildLocalSymbolKey, buildStableSymbolKey, maskCommentsAndTemplateLiterals, resolveRelativeTargetPath } from "./shared";
import type { ParsedWorkspaceSemantics } from "./types";

export function parseDartFile(
  file: WorkspaceFileCandidate,
  filePathSet: Set<string>,
  projectImportId: string,
): ParsedWorkspaceSemantics {
  const semantics: ParsedWorkspaceSemantics = {
    symbols: [],
    imports: [],
    exports: [],
    relationships: [],
    issues: [],
    externalSymbols: [],
  };
  const originalLines = (file.content ?? "").split(/\r?\n/);
  const lines = maskCommentsAndTemplateLiterals(file.content ?? "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const originalLine = originalLines[index] ?? line;
    const lineNumber = index + 1;

    for (const match of line.matchAll(/^\s*(import|export|part)\s+['"]([^'"]+)['"]/g)) {
      const kind = match[1];
      const moduleSpecifier = match[2];
      if (!kind || !moduleSpecifier) continue;

      const resolution = resolveRelativeTargetPath(file.path, moduleSpecifier, file.language!, filePathSet);
      const importKind = kind === "part" ? "include" : kind === "export" ? "export_from" : "import";
      const localKey = buildImportLocalKey(file.path, importKind, moduleSpecifier, lineNumber, match.index ?? 0);

      semantics.imports.push({
        localKey,
        moduleSpecifier,
        importKind,
        isTypeOnly: false,
        line: lineNumber,
        col: match.index ?? 0,
        endCol: (match.index ?? 0) + moduleSpecifier.length,
        resolutionKind: resolution.resolvedPath ? "relative_path" : "unresolved",
        targetPathText: resolution.resolvedPath ?? resolution.attemptedPath,
        targetExternalSymbolKey: null,
      });

      if (!resolution.resolvedPath) {
        semantics.issues.push({
          projectImportId,
          severity: "warning",
          code: "UNRESOLVED_IMPORT",
          message: `Unable to resolve ${kind} "${moduleSpecifier}" from ${file.path}`,
          detailJson: { filePath: file.path, moduleSpecifier, kind },
        });
      }

      if (kind === "export") {
        semantics.exports.push({
          exportName: moduleSpecifier,
          exportKind: "re_export",
          line: lineNumber,
          col: match.index ?? 0,
          endCol: (match.index ?? 0) + match[0].length,
          sourceImportLocalKey: localKey,
        });
      }
    }

    const symbolPatterns: Array<{ regex: RegExp; kind: "class" | "mixin" | "enum" | "type_alias" }> = [
      { regex: /^\s*class\s+([A-Za-z_]\w*)/, kind: "class" },
      { regex: /^\s*mixin\s+([A-Za-z_]\w*)/, kind: "mixin" },
      { regex: /^\s*extension\s+([A-Za-z_]\w*)/, kind: "mixin" },
      { regex: /^\s*enum\s+([A-Za-z_]\w*)/, kind: "enum" },
      { regex: /^\s*typedef\s+([A-Za-z_]\w*)/, kind: "type_alias" },
    ];

    for (const pattern of symbolPatterns) {
      const match = line.match(pattern.regex);
      if (!match?.[1]) continue;

      const displayName = match[1];
      const col = line.indexOf(displayName);

      semantics.symbols.push({
        localKey: buildLocalSymbolKey(file.path, pattern.kind, displayName),
        stableKey: buildStableSymbolKey(file.path, pattern.kind, displayName, lineNumber),
        displayName,
        kind: pattern.kind,
        language: file.language!,
        signature: originalLine.trim(),
        returnType: null,
        doc: null,
        isExported: false,
        isDefaultExport: false,
        line: lineNumber,
        col: Math.max(col, 0),
        endCol: Math.max(col, 0) + displayName.length,
      });
      break;
    }
  });

  return semantics;
}
